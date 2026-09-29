import request from "supertest";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, clearDb, stopTestDb } from "./helpers/db.js";
import { createUser } from "./helpers/auth.js";
import cronRouter from "../src/routes/cron.js";
import { ExpenseModel } from "../src/models/Expense.js";

const app = express();
app.use("/api/cron", cronRouter);

const CRON_SECRET = process.env.CRON_SECRET!;

function dueDate(): Date {
  return new Date(Date.now() - 60_000);
}

beforeAll(async () => {
  await startTestDb();
});

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await stopTestDb();
});

describe("GET /api/cron/recurring", () => {
  it("rejects requests without the bearer secret", async () => {
    const res = await request(app).get("/api/cron/recurring");
    expect(res.status).toBe(401);
  });

  it("rejects a wrong bearer secret", async () => {
    const res = await request(app)
      .get("/api/cron/recurring")
      .set("Authorization", "Bearer wrong-secret");
    expect(res.status).toBe(401);
  });

  it("generates due recurring transactions when authorized", async () => {
    const user = await createUser();
    const due = dueDate();
    await ExpenseModel.create({
      userId: user._id,
      type: "expense",
      amount: 10,
      category: "Recurring",
      currency: "USD",
      date: due,
      recurrence: { frequency: "daily", nextDueDate: due, isActive: true },
    });

    const res = await request(app)
      .get("/api/cron/recurring")
      .set("Authorization", `Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const generated = await ExpenseModel.find({ userId: user._id, recurrence: null });
    expect(generated).toHaveLength(1);
    expect(generated[0].amount).toBe(10);
  });

  it("is idempotent across repeated runs", async () => {
    const user = await createUser();
    const due = dueDate();
    await ExpenseModel.create({
      userId: user._id,
      type: "expense",
      amount: 7,
      category: "Rent",
      currency: "USD",
      date: due,
      recurrence: { frequency: "weekly", nextDueDate: due, isActive: true },
    });

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .get("/api/cron/recurring")
        .set("Authorization", `Bearer ${CRON_SECRET}`);
      expect(res.status).toBe(200);
    }

    const generated = await ExpenseModel.find({ userId: user._id, recurrence: null });
    expect(generated).toHaveLength(1);
  });
});
