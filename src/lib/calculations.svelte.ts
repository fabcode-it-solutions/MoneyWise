import { warmConversionRates, convertToDisplayCurrencySync } from './currency.js';
import type { Expense, Summary, IncomeSummary, ExpenseSummary, CategoryData } from '../types.js';

export async function calculateSummary(expense: Expense[], currency: string): Promise<Summary> {
  await warmConversionRates(expense.map(item => item.currency), currency);
  let income = 0;
  let expenses = 0;
  for (const item of expense) {
    const converted = convertToDisplayCurrencySync(item.amount, item.currency, currency);
    if (item.type === 'income') income += converted.amount;
    else expenses += converted.amount;
  }
  return { income, expenses, balance: income - expenses };
}

export async function calculateIncomeSummary(expense: Expense[], currency: string): Promise<IncomeSummary> {
  const incomeItems = expense.filter(t => t.type === 'income');
  await warmConversionRates(incomeItems.map(item => item.currency), currency);
  let total = 0;
  for (const item of incomeItems) {
    const converted = convertToDisplayCurrencySync(item.amount, item.currency, currency);
    total += converted.amount;
  }
  const count = incomeItems.length;
  return { total, count, average: count > 0 ? total / count : 0 };
}

export async function calculateExpenseSummary(expense: Expense[], currency: string): Promise<ExpenseSummary> {
  const expenseItems = expense.filter(t => t.type === 'expense');
  await warmConversionRates(expenseItems.map(item => item.currency), currency);
  let total = 0;
  for (const item of expenseItems) {
    const converted = convertToDisplayCurrencySync(item.amount, item.currency, currency);
    total += converted.amount;
  }
  const count = expenseItems.length;
  return { total, count, average: count > 0 ? total / count : 0 };
}

export async function calculateExpenseByCategory(expense: Expense[], currency: string): Promise<{ data: CategoryData[]; total: number }> {
  const expenseItems = expense.filter(t => t.type === 'expense');
  await warmConversionRates(expenseItems.map(item => item.currency), currency);
  const categoryTotals: Record<string, number> = {};
  for (const item of expenseItems) {
    const converted = convertToDisplayCurrencySync(item.amount, item.currency, currency);
    if (!categoryTotals[item.category]) categoryTotals[item.category] = 0;
    categoryTotals[item.category] += converted.amount;
  }
  const total = Object.values(categoryTotals).reduce((sum, amt) => sum + amt, 0);
  const data: CategoryData[] = Object.entries(categoryTotals).map(([category, amount]) => ({
    category, amount, percentage: total > 0 ? (amount / total) * 100 : 0
  }));
  return { data, total };
}

export async function calculateMemberBreakdown(expense: Expense[], currency: string): Promise<{ data: CategoryData[]; total: number }> {
  const attributedItems = expense.filter(item => item.authorNickname);
  await warmConversionRates(attributedItems.map(item => item.currency), currency);
  const memberTotals: Record<string, number> = {};
  for (const item of attributedItems) {
    const nickname = item.authorNickname as string;
    const converted = convertToDisplayCurrencySync(item.amount, item.currency, currency);
    memberTotals[nickname] = (memberTotals[nickname] || 0) + converted.amount;
  }
  const total = Object.values(memberTotals).reduce((sum, amt) => sum + amt, 0);
  const data: CategoryData[] = Object.entries(memberTotals).map(([category, amount]) => ({
    category, amount, percentage: total > 0 ? (amount / total) * 100 : 0
  }));
  return { data, total };
}

export async function getCurrentMonthExpenseByCategory(expense: Expense[], currency: string): Promise<Record<string, number>> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const items = expense.filter(item => {
    if (item.type !== 'expense') return false;
    const [y, m] = item.date.split('-').map(Number);
    return y === year && m - 1 === month;
  });
  await warmConversionRates(items.map(item => item.currency), currency);
  const totals: Record<string, number> = {};
  for (const item of items) {
    const converted = convertToDisplayCurrencySync(item.amount, item.currency, currency);
    totals[item.category] = (totals[item.category] || 0) + converted.amount;
  }
  return totals;
}
