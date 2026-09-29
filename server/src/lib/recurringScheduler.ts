import { Model } from "mongoose";
import { ExpenseModel } from "../models/Expense.js";
import { SpaceModel } from "../models/Space.js";
import { getSpaceExpenseModel } from "./spaceDb.js";
import { notifyDataChanged, notifySpaceDataChanged } from "./pusher.js";

/**
 * Calculate the next due date based on frequency and current due date.
 */
function calculateNextDueDate(
  currentDue: Date,
  frequency: string
): Date {
  const next = new Date(currentDue);
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

/**
 * Process all recurring templates due in a single Model (personal ledger or
 * one Hub's ledger), atomically claiming each one so concurrent instances
 * don't double-generate. Returns the set of notify-keys (e.g. userId) whose
 * templates actually fired, so the caller notifies only what changed.
 */
async function processRecurringForModel(
  Model: Model<any>,
  extraCreateFields: (template: any) => Record<string, unknown>,
  getNotifyKey: (template: any) => string,
  filter: Record<string, unknown> = {}
): Promise<Set<string>> {
  const now = new Date();
  const notifyKeys = new Set<string>();

  while (true) {
    const template: any = await Model.findOne({
      ...filter,
      "recurrence.isActive": true,
      "recurrence.nextDueDate": { $lte: now },
    }).lean();

    if (!template) break;

    const rec = template.recurrence;
    if (!rec || !rec.isActive) break;

    if (rec.endDate && new Date(rec.endDate) < now) {
      await Model.findOneAndUpdate(
        { _id: template._id, ...filter, "recurrence.nextDueDate": rec.nextDueDate },
        { $set: { "recurrence.isActive": false } }
      );
      continue;
    }

    const nextDue = calculateNextDueDate(new Date(rec.nextDueDate), rec.frequency);
    const shouldDeactivate = !!(rec.endDate && nextDue > new Date(rec.endDate));

    const claimed = await Model.findOneAndUpdate(
      { _id: template._id, ...filter, "recurrence.nextDueDate": rec.nextDueDate },
      { $set: { "recurrence.nextDueDate": nextDue, "recurrence.isActive": !shouldDeactivate } },
      { new: false }
    );

    if (!claimed) continue;

    await Model.create({
      ...extraCreateFields(template),
      type: template.type,
      amount: template.amount,
      category: template.category,
      currency: template.currency,
      name: template.name || "",
      note: template.note || "",
      date: new Date(rec.nextDueDate),
      recurrence: undefined,
    });

    notifyKeys.add(getNotifyKey(template));
  }

  return notifyKeys;
}

/**
 * Process all recurring transactions that are due, across the personal
 * ledger and every Hub's separate database.
 */
export async function processRecurringTransactions(): Promise<void> {
  try {
    const affectedUsers = await processRecurringForModel(
      ExpenseModel,
      (template) => ({ userId: template.userId, familyMember: template.familyMember || "" }),
      (template) => String(template.userId)
    );
    if (affectedUsers.size > 0) {
      console.log(`[Recurring] Processed recurring transactions for ${affectedUsers.size} user(s)`);
      for (const uid of affectedUsers) notifyDataChanged(uid);
    }

    const spaces = await SpaceModel.find().select("_id").lean();
    for (const space of spaces) {
      const spaceId = String(space._id);
      const spaceModel = getSpaceExpenseModel(spaceId);
      const notified = await processRecurringForModel(
        spaceModel,
        (template) => ({ authorUserId: template.authorUserId }),
        () => spaceId
      );
      if (notified.size > 0) {
        console.log(`[Recurring] Processed recurring transaction(s) in Hub ${spaceId}`);
        notifySpaceDataChanged(spaceId);
      }
    }
  } catch (err) {
    console.error("[Recurring] Error processing recurring transactions:", err);
  }
}

/**
 * Process due recurring transactions for a single user's personal ledger.
 * Called from the expense list route so entries appear the moment the user
 * opens the app (lazy catch-up), without needing a global scheduler tick.
 */
export async function processRecurringForUser(userId: string): Promise<void> {
  const affectedUsers = await processRecurringForModel(
    ExpenseModel,
    (template) => ({ userId: template.userId, familyMember: template.familyMember || "" }),
    (template) => String(template.userId),
    { userId }
  );
  if (affectedUsers.size > 0) {
    for (const uid of affectedUsers) notifyDataChanged(uid);
  }
}

/**
 * Process due recurring transactions for a single Hub's ledger.
 */
export async function processRecurringForSpace(spaceId: string): Promise<void> {
  const spaceModel = getSpaceExpenseModel(spaceId);
  const notified = await processRecurringForModel(
    spaceModel,
    (template) => ({ authorUserId: template.authorUserId }),
    () => spaceId
  );
  if (notified.size > 0) {
    notifySpaceDataChanged(spaceId);
  }
}

/**
 * Start the recurring transaction scheduler.
 * Checks every 60 seconds for due transactions.
 *
 * Only intended for long-running processes (local `npm run dev`, a dedicated
 * worker host). Serverless deployments must NOT call this — Vercel functions
 * scale to zero and a setInterval only ticks while an instance is alive.
 * Use the protected /api/cron/recurring endpoint instead (GitHub Actions
 * schedule), plus the lazy per-user catch-up on ledger reads.
 */
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startRecurringScheduler(): void {
  if (schedulerInterval) return;
  console.log("[Recurring] Starting recurring transaction scheduler (60s interval)");
  schedulerInterval = setInterval(processRecurringTransactions, 60_000);
  // Run immediately on startup
  processRecurringTransactions();
}

export function stopRecurringScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
