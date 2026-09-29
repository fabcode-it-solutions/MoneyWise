import { describe, expect, it } from "vitest";
import {
  formatDate,
  parseLocalExpenseDate,
  startOfDay,
  addDays,
  formatDateKey,
  formatMonthKey,
  getTrendPeriodLabel,
  calculateExpenseTrendData,
} from "./utils.js";
import type { Expense } from "../types.js";

function expense(overrides: Partial<Expense> & Pick<Expense, "amount" | "category" | "date">): Expense {
  const base: Expense = {
    id: Math.random().toString(36).slice(2),
    type: "expense",
    amount: 0,
    category: "Other",
    date: "2026-01-01",
    currency: "USD",
  };
  return { ...base, ...overrides };
}

describe("date helpers", () => {
  it("formats a date string for display", () => {
    const out = formatDate("2026-01-15");
    expect(out).toContain("15");
  });

  it("parses local date strings without timezone drift", () => {
    const d = parseLocalExpenseDate("2026-02-03");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(1);
    expect(d?.getDate()).toBe(3);
  });

  it("returns null for unparseable dates", () => {
    expect(parseLocalExpenseDate("")).toBeNull();
    expect(parseLocalExpenseDate("nonsense")).toBeNull();
  });

  it("round-trips through formatDateKey", () => {
    const d = new Date(2026, 6, 4);
    expect(formatDateKey(d)).toBe("2026-07-04");
    expect(formatMonthKey(d)).toBe("2026-07");
  });

  it("computes day boundaries and offsets", () => {
    const d = new Date(2026, 0, 15, 13, 45, 30);
    const sod = startOfDay(d);
    expect(sod.getHours()).toBe(0);
    expect(sod.getMinutes()).toBe(0);
    expect(addDays(d, 1).getDate()).toBe(16);
    expect(addDays(d, -1).getDate()).toBe(14);
  });

  it("labels trend ranges", () => {
    expect(getTrendPeriodLabel("all")).toBe("All Time");
    expect(getTrendPeriodLabel("week")).toBe("Last 7 Days");
    expect(getTrendPeriodLabel("day")).toBe("Today");
    expect(getTrendPeriodLabel("month")).toBe("This Month");
  });
});

describe("calculateExpenseTrendData", () => {
  it("buckets all-time data by month", async () => {
    const items = [
      expense({ amount: 100, category: "A", date: "2026-01-10" }),
      expense({ amount: 50, category: "B", date: "2026-02-15" }),
      expense({ amount: 999, category: "C", date: "2026-02-16", type: "income" }), // excluded
    ];
    const trend = await calculateExpenseTrendData(items, "all", "USD");
    expect(trend.periodLabel).toBe("All Time");
    expect(trend.points.map((p) => p.key)).toEqual(["2026-01", "2026-02"]);
    expect(trend.points[0].amount).toBe(100);
    expect(trend.points[1].amount).toBe(50);
    expect(trend.total).toBe(150);
    expect(trend.average).toBe(75);
  });

  it("returns an empty series when there are no expenses", async () => {
    const trend = await calculateExpenseTrendData([], "all", "USD");
    expect(trend.points).toHaveLength(0);
    expect(trend.total).toBe(0);
  });

  it("buckets the last 7 days into daily points", async () => {
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);

    const items = [
      expense({ amount: 30, category: "A", date: formatDateKey(today) }),
      expense({ amount: 10, category: "B", date: formatDateKey(threeDaysAgo) }),
      expense({ amount: 999, category: "C", date: formatDateKey(new Date(today.getFullYear(), today.getMonth() - 2, 5)) }), // out of window
    ];
    const trend = await calculateExpenseTrendData(items, "week", "USD");
    expect(trend.points).toHaveLength(7);
    expect(trend.total).toBe(40);
    expect(trend.average).toBe(20);
    expect(trend.periodLabel).toBe("Last 7 Days");
  });
});
