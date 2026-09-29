import { describe, expect, it, vi } from "vitest";

// Stub network access: fetchCurrencyRates returns EUR base -> USD = 2.
vi.mock("./api.js", () => ({
  convertCurrency: vi.fn(async (amount: number) => amount),
  fetchCurrencyRates: vi.fn(async (from: string) => ({ USD: 2, [from]: 1 })),
}));

import {
  calculateSummary,
  calculateIncomeSummary,
  calculateExpenseSummary,
  calculateExpenseByCategory,
  calculateMemberBreakdown,
  getCurrentMonthExpenseByCategory,
} from "./calculations.svelte.js";
import { formatDateKey } from "./utils.js";
import type { Expense } from "../types.js";

function expense(overrides: Partial<Expense> & Pick<Expense, "type" | "amount" | "category">): Expense {
  const base: Expense = {
    id: Math.random().toString(36).slice(2),
    type: "expense",
    amount: 0,
    category: "Other",
    date: "2026-01-15",
    currency: "USD",
  };
  return { ...base, ...overrides };
}

describe("calculateSummary", () => {
  it("computes income, expenses, and balance in the display currency", async () => {
    const items = [
      expense({ type: "income", amount: 200, category: "Salary" }),
      expense({ type: "expense", amount: 50, category: "Food & Dining" }),
      expense({ type: "expense", amount: 25, category: "Transportation" }),
    ];
    const summary = await calculateSummary(items, "USD");
    expect(summary).toEqual({ income: 200, expenses: 75, balance: 125 });
  });

  it("converts foreign-currency amounts to the display currency", async () => {
    const items = [expense({ type: "income", amount: 10, category: "Salary", currency: "EUR" })];
    const summary = await calculateSummary(items, "USD");
    expect(summary.income).toBe(20);
  });

  it("handles an empty ledger", async () => {
    const summary = await calculateSummary([], "USD");
    expect(summary).toEqual({ income: 0, expenses: 0, balance: 0 });
  });
});

describe("calculateIncomeSummary / calculateExpenseSummary", () => {
  it("computes totals, counts, and averages", async () => {
    const items = [
      expense({ type: "income", amount: 100, category: "Salary" }),
      expense({ type: "income", amount: 200, category: "Salary" }),
      expense({ type: "income", amount: 300, category: "Freelance" }),
      expense({ type: "expense", amount: 60, category: "Food & Dining" }),
    ];
    const income = await calculateIncomeSummary(items, "USD");
    expect(income).toEqual({ total: 600, count: 3, average: 200 });

    const out = await calculateExpenseSummary(items, "USD");
    expect(out).toEqual({ total: 60, count: 1, average: 60 });
  });

  it("returns zeros for empty ledgers", async () => {
    expect(await calculateIncomeSummary([], "USD")).toEqual({ total: 0, count: 0, average: 0 });
    expect(await calculateExpenseSummary([], "USD")).toEqual({ total: 0, count: 0, average: 0 });
  });
});

describe("calculateExpenseByCategory", () => {
  it("groups expenses by category with percentages", async () => {
    const items = [
      expense({ type: "expense", amount: 60, category: "Food & Dining" }),
      expense({ type: "expense", amount: 40, category: "Transportation" }),
      expense({ type: "income", amount: 999, category: "Salary" }), // excluded
    ];
    const result = await calculateExpenseByCategory(items, "USD");
    expect(result.total).toBe(100);
    expect(result.data).toHaveLength(2);
    const byName = Object.fromEntries(result.data.map((d) => [d.category, d]));
    expect(byName["Food & Dining"].percentage).toBeCloseTo(60);
    expect(byName["Transportation"].percentage).toBeCloseTo(40);
  });
});

describe("calculateMemberBreakdown", () => {
  it("only counts expenses attributed to a member", async () => {
    const items = [
      expense({ type: "expense", amount: 30, category: "Food & Dining", authorNickname: "Alice" }),
      expense({ type: "expense", amount: 70, category: "Food & Dining", authorNickname: "Bob" }),
      expense({ type: "expense", amount: 500, category: "Food & Dining" }), // no attribution
    ];
    const result = await calculateMemberBreakdown(items, "USD");
    expect(result.total).toBe(100);
    expect(result.data).toHaveLength(2);
  });
});

describe("getCurrentMonthExpenseByCategory", () => {
  it("only includes expenses dated in the current month", async () => {
    const now = new Date();
    const thisMonth = formatDateKey(now);
    const lastMonth = formatDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 15));

    const items = [
      expense({ type: "expense", amount: 25, category: "Food & Dining", date: thisMonth }),
      expense({ type: "expense", amount: 900, category: "Old", date: lastMonth }),
      expense({ type: "income", amount: 999, category: "Salary", date: thisMonth }),
    ];
    const totals = await getCurrentMonthExpenseByCategory(items, "USD");
    expect(totals).toEqual({ "Food & Dining": 25 });
  });
});
