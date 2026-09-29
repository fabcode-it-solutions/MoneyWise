import { Router } from "express";
import Groq from "groq-sdk";
import { ExpenseModel } from "../models/Expense.js";
import { UserModel } from "../models/User.js";
import { SummaryModel } from "../models/Summary.js";
import { authRequired } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { config } from "../config.js";
import { groqSlidingLimiter, acquireGroqSlot, releaseGroqSlot } from "../middleware/groqRateLimiter.js";
import { zonedNowParts } from "../lib/timezone.js";

const router = Router();
router.use(authRequired);

function groqClient() {
  if (!config.groqApiKey) {
    const err = new Error("AI features require GROQ_API_KEY to be set") as Error & { status: number };
    err.status = 503;
    throw err;
  }
  return new Groq({ apiKey: config.groqApiKey });
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDaysToYMD(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// C9: weeks run Monday..Sunday. Transaction dates are stored as plain
// UTC-midnight calendar days (matching the rest of the app), so week
// boundaries stay in calendar-date space rather than converting through
// real timezone-instant math — the only place the user's timezone actually
// matters is figuring out what "today" is for them right now.
function getWeekRange(timeZone: string, weeksAgo: number) {
  const now = zonedNowParts(timeZone);
  const diffToMonday = now.dayOfWeek === 0 ? 6 : now.dayOfWeek - 1;
  const currentMonday = addDaysToYMD(now.y, now.m, now.d, -diffToMonday);
  const monday = addDaysToYMD(currentMonday.y, currentMonday.m, currentMonday.d, -7 * weeksAgo);
  const sunday = addDaysToYMD(monday.y, monday.m, monday.d, 6);
  const startKey = dateKey(monday.y, monday.m, monday.d);
  const endKey = dateKey(sunday.y, sunday.m, sunday.d);
  return {
    startKey,
    endKey,
    startUtc: new Date(`${startKey}T00:00:00.000Z`),
    endUtc: new Date(`${endKey}T23:59:59.999Z`),
  };
}

interface CategoryBreakdown { category: string; amount: number; count: number }
interface WeekStats {
  transactions: Array<{ type: string; amount: number; category: string; note?: string }>;
  totalIncome: number;
  totalExpense: number;
  net: number;
  transactionCount: number;
  byCategory: CategoryBreakdown[];
}

async function computeWeekStats(userId: string, startUtc: Date, endUtc: Date): Promise<WeekStats> {
  const transactions = await ExpenseModel.find({
    userId,
    date: { $gte: startUtc, $lte: endUtc },
  })
    .sort({ date: 1 })
    .lean();

  const income = transactions.filter((t) => t.type === "income");
  const expense = transactions.filter((t) => t.type === "expense");
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);
  const totalExpense = expense.reduce((s, t) => s + t.amount, 0);

  const byCategoryMap = new Map<string, CategoryBreakdown>();
  for (const t of expense) {
    const existing = byCategoryMap.get(t.category) ?? { category: t.category, amount: 0, count: 0 };
    existing.amount += t.amount;
    existing.count += 1;
    byCategoryMap.set(t.category, existing);
  }

  return {
    transactions,
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    transactionCount: transactions.length,
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.amount - a.amount),
  };
}

function fallbackNarrative(stats: WeekStats, lang: string): string {
  const top = stats.byCategory[0];
  if (lang === "es") {
    return (
      `Esta semana gastaste ${stats.totalExpense.toFixed(2)} en ${stats.transactionCount} transacción(es)` +
      (top ? `, siendo ${top.category} tu categoría más grande con ${top.amount.toFixed(2)}.` : ".")
    );
  }
  return (
    `This week you spent ${stats.totalExpense.toFixed(2)} across ${stats.transactionCount} transaction(s)` +
    (top ? `, with ${top.category} as your largest category at ${top.amount.toFixed(2)}.` : ".")
  );
}

// C10: generation is deliberately data-first — every number in the prompt is
// pre-computed server-side so the model only has to narrate real figures,
// not calculate or invent them, which is what keeps this from reading as
// generic AI filler.
async function generateNarrative(stats: WeekStats, prevStats: WeekStats, startKey: string, endKey: string, lang: string): Promise<string> {
  if (!groqSlidingLimiter.allow(config.groqApiKey, 25) || !acquireGroqSlot()) {
    return fallbackNarrative(stats, lang);
  }
  try {
    const topCategories = stats.byCategory
      .slice(0, 6)
      .map((c) => `- ${c.category}: ${c.amount.toFixed(2)} across ${c.count} transaction(s)`)
      .join("\n");

    const notesList = stats.transactions
      .filter((t) => t.type === "expense" && t.note)
      .slice(0, 25)
      .map((t) => `- ${t.category} — "${t.note}": ${t.amount.toFixed(2)}`)
      .join("\n");

    const changeText =
      prevStats.transactionCount > 0
        ? (() => {
            const diff = stats.totalExpense - prevStats.totalExpense;
            const pct = prevStats.totalExpense > 0 ? ((diff / prevStats.totalExpense) * 100).toFixed(1) : "n/a";
            return `Previous week's total expenses: ${prevStats.totalExpense.toFixed(2)} (this week is ${diff >= 0 ? "up" : "down"} ${Math.abs(diff).toFixed(2)}, ${pct}%).`;
          })()
        : "No transactions recorded the previous week to compare against.";

    const prompt = `You are writing a weekly spending summary for a personal finance app called MoneyWise.
Use ONLY the numbers given below — never estimate, round loosely, or invent a figure that isn't here.
Reference actual category names and merchant/description notes from the data. Do not use generic filler
phrases like "great job" or "you should budget better" unless directly tied to a specific number below.
Write 3-4 short, dense paragraphs, then a "Highlights" section with 2-4 bullet points calling out concrete
things (e.g. the single largest expense with its amount and note, the category that grew or shrank the most
vs last week with the actual percentage, an unusually high-frequency category).${
  lang === "es"
    ? "\nWrite the summary in Spanish (es). Use natural, conversational Spanish."
    : lang && lang !== "en"
      ? `\nWrite the summary in the user's language (locale: ${lang}).`
      : ""
}

Week: ${startKey} to ${endKey}
Total income: ${stats.totalIncome.toFixed(2)}
Total expenses: ${stats.totalExpense.toFixed(2)}
Net: ${stats.net.toFixed(2)}
Transaction count: ${stats.transactionCount}

Spending by category (highest first):
${topCategories || "No expenses recorded this week."}

${changeText}

Individual expense notes this week:
${notesList || "No notes recorded on any expense this week."}`;

    const completion = await groqClient().chat.completions.create({
      model: config.groqModel,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 700,
      temperature: 0.4,
    });

    return completion.choices[0]?.message?.content?.trim() || fallbackNarrative(stats, lang);
  } catch (err) {
    console.error("[Summaries] Groq generation failed:", err);
    return fallbackNarrative(stats, lang);
  } finally {
    releaseGroqSlot();
  }
}

// GET /api/summaries — lazily generates the summary for the most recently
// completed week (in the user's timezone) the first time it's requested,
// the same lazy-reset pattern the weekly AI quota uses, then returns full
// history. Does not touch the user's interactive AI quota — generation is
// capped to at most one Groq call per user per calendar week regardless of
// how many times this endpoint is hit, via the unique (userId, weekStartDate) index.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.userId).select("timezone").lean();
    const timezone = user?.timezone || "UTC";

    const { startKey, endKey, startUtc, endUtc } = getWeekRange(timezone, 1);
    const existing = await SummaryModel.findOne({ userId: req.userId, weekStartDate: startKey }).lean();
    const lang = typeof req.query.lang === "string" ? req.query.lang : "en";

    if (!existing) {
      const stats = await computeWeekStats(req.userId!, startUtc, endUtc);

      if (stats.transactionCount > 0) {
        const prevRange = getWeekRange(timezone, 2);
        const prevStats = await computeWeekStats(req.userId!, prevRange.startUtc, prevRange.endUtc);
        const narrative = await generateNarrative(stats, prevStats, startKey, endKey, lang);

        try {
          await SummaryModel.create({
            userId: req.userId,
            weekStartDate: startKey,
            weekEndDate: endKey,
            timezone,
            narrative,
            stats: {
              totalIncome: stats.totalIncome,
              totalExpense: stats.totalExpense,
              net: stats.net,
              transactionCount: stats.transactionCount,
              byCategory: stats.byCategory,
              previousWeekExpense: prevStats.transactionCount > 0 ? prevStats.totalExpense : null,
            },
          });
        } catch (err: any) {
          // Unique index race: another concurrent request already created this
          // week's summary — ignore and fall through to the read below.
          if (err?.code !== 11000) throw err;
        }
      }
    }

    const summaries = await SummaryModel.find({ userId: req.userId }).sort({ weekStartDate: -1 }).lean();
    return res.json({ summaries });
  })
);

export default router;
