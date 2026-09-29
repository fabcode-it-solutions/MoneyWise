import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, clearDb, stopTestDb } from "./helpers/db.js";
import { createUser } from "./helpers/auth.js";
import { processRecurringTransactions } from "../src/lib/recurringScheduler.js";
import { ExpenseModel } from "../src/models/Expense.js";
import { SpaceModel } from "../src/models/Space.js";
import { getSpaceExpenseModel } from "../src/lib/spaceDb.js";

beforeAll(async () => {
  await startTestDb();
});

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await stopTestDb();
});

function dueDate(): Date {
  return new Date(Date.now() - 60_000);
}

function futureDate(): Date {
  return new Date(Date.now() + 60_000);
}

function recurringTemplate(userId: string, overrides: Record<string, unknown> = {}) {
  const due = dueDate();
  return {
    userId,
    type: "expense" as const,
    amount: 10,
    category: "Recurring",
    currency: "USD",
    date: due,
    recurrence: { frequency: "daily", nextDueDate: due, isActive: true },
    ...overrides,
  };
}

describe("recurring transaction scheduler", () => {
  it("generates a due transaction and advances the next due date", async () => {
    const user = await createUser();
    const due = dueDate();
    await ExpenseModel.create(recurringTemplate(user._id.toString()));

    await processRecurringTransactions();

    const generated = await ExpenseModel.find({ userId: user._id, recurrence: null });
    expect(generated).toHaveLength(1);
    expect(generated[0].amount).toBe(10);
    expect(generated[0].date.getTime()).toBe(due.getTime());

    const template = await ExpenseModel.findOne({ "recurrence.isActive": true });
    expect(template).toBeTruthy();
    expect(new Date(template!.recurrence!.nextDueDate).getTime()).toBe(due.getTime() + 24 * 60 * 60 * 1000);
  });

  it("leaves future-dated templates untouched", async () => {
    const user = await createUser();
    const next = futureDate();
    await ExpenseModel.create(
      recurringTemplate(user._id.toString(), { recurrence: { frequency: "daily", nextDueDate: next, isActive: true } })
    );

    await processRecurringTransactions();

    const generated = await ExpenseModel.find({ userId: user._id, recurrence: null });
    expect(generated).toHaveLength(0);
    const template = await ExpenseModel.findOne({ "recurrence.isActive": true });
    expect(template).toBeTruthy();
  });

  it("deactivates templates whose end date has passed without generating", async () => {
    const user = await createUser();
    const due = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await ExpenseModel.create(
      recurringTemplate(user._id.toString(), {
        recurrence: { frequency: "daily", nextDueDate: due, isActive: true, endDate },
      })
    );

    await processRecurringTransactions();

    const generated = await ExpenseModel.find({ userId: user._id, recurrence: null });
    expect(generated).toHaveLength(0);
    const template = await ExpenseModel.findOne({});
    expect(template!.recurrence!.isActive).toBe(false);
  });

  it("generates exactly one transaction when two runs race", async () => {
    const user = await createUser();
    await ExpenseModel.create(recurringTemplate(user._id.toString()));

    // Two concurrent runs exercise the atomic findOneAndUpdate claim: only one
    // run may advance the template, so only one expense is ever created.
    await Promise.all([processRecurringTransactions(), processRecurringTransactions()]);

    const generated = await ExpenseModel.find({ userId: user._id, recurrence: null });
    expect(generated).toHaveLength(1);
  });

  it("generates transactions in Hub ledgers without touching the personal ledger", async () => {
    const user = await createUser();
    const space = await SpaceModel.create({
      name: "Test Hub",
      ownerId: user._id,
      members: [{ userId: user._id, nickname: "Owner", role: "owner", status: "active" }],
    });
    const spaceModel = getSpaceExpenseModel(String(space._id));
    const due = dueDate();

    await spaceModel.create({
      authorUserId: user._id,
      type: "expense",
      amount: 5,
      category: "Shared",
      currency: "USD",
      date: due,
      recurrence: { frequency: "weekly", nextDueDate: due, isActive: true },
    });

    await processRecurringTransactions();

    const generated = await spaceModel.find({ recurrence: null });
    expect(generated).toHaveLength(1);
    expect(generated[0].authorUserId.toString()).toBe(user._id.toString());

    const personal = await ExpenseModel.find({ userId: user._id });
    expect(personal).toHaveLength(0);
  });
});
