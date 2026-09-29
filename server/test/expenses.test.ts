import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, clearDb, stopTestDb } from "./helpers/db.js";
import { createUser } from "./helpers/auth.js";
import expenseRouter from "../src/routes/expenses.js";
import { ExpenseModel } from "../src/models/Expense.js";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use("/api/expenses", expenseRouter);

const validBody = {
  type: "expense",
  amount: 25.5,
  category: "Food & Dining",
  date: "2026-01-15",
  currency: "USD",
  note: "lunch",
};

beforeAll(async () => {
  await startTestDb();
});

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await stopTestDb();
});

function as(token: string) {
  return { Cookie: [`sw_session=${token}`] };
}

describe("expense CRUD", () => {
  it("creates an expense and stamps the owning user", async () => {
    const { _id, token } = await createUser();
    const res = await request(app).post("/api/expenses").set(as(token)).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(_id.toString());
    expect(res.body.amount).toBe(25.5);
    expect(res.body.category).toBe("Food & Dining");
  });

  it("validates required fields and types on create", async () => {
    const { token } = await createUser();
    const badCases: Array<Record<string, unknown>> = [
      { ...validBody, type: "savings" },
      { ...validBody, amount: 0 },
      { ...validBody, amount: -5 },
      { ...validBody, amount: "25" },
      { ...validBody, category: "" },
      { ...validBody, date: undefined },
    ];
    for (const body of badCases) {
      const res = await request(app).post("/api/expenses").set(as(token)).send(body);
      expect(res.status).toBe(400);
    }
  });

  it("lists only the authenticated user's expenses", async () => {
    const userA = await createUser();
    const userB = await createUser();

    await request(app).post("/api/expenses").set(as(userA.token)).send(validBody);
    await request(app)
      .post("/api/expenses")
      .set(as(userB.token))
      .send({ ...validBody, category: "B-category" });

    const res = await request(app).get("/api/expenses").set(as(userA.token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].category).toBe("Food & Dining");
  });

  it("ignores attempts to set the userId via mass assignment", async () => {
    const attacker = await createUser();
    const victim = await createUser();
    const res = await request(app)
      .post("/api/expenses")
      .set(as(attacker.token))
      .send({ ...validBody, userId: victim._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(attacker._id.toString());
  });

  it("updates only whitelisted fields", async () => {
    const user = await createUser();
    const other = await createUser();
    const created = await request(app).post("/api/expenses").set(as(user.token)).send(validBody);
    const id = created.body._id as string;

    const res = await request(app)
      .put(`/api/expenses/${id}`)
      .set(as(user.token))
      .send({ amount: 99, category: "Updated", userId: other._id.toString() });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(99);
    expect(res.body.category).toBe("Updated");
    expect(res.body.userId).toBe(user._id.toString());
  });

  it("returns 400 for a malformed id and 404 for a missing expense", async () => {
    const user = await createUser();
    const bad = await request(app)
      .put("/api/expenses/not-an-object-id")
      .set(as(user.token))
      .send({ amount: 1 });
    expect(bad.status).toBe(400);

    const missing = await request(app)
      .put(`/api/expenses/${"0123456789abcdef01234567"}`)
      .set(as(user.token))
      .send({ amount: 1 });
    expect(missing.status).toBe(404);
  });

  it("deletes a single expense", async () => {
    const user = await createUser();
    const created = await request(app).post("/api/expenses").set(as(user.token)).send(validBody);
    const id = created.body._id as string;

    const del = await request(app).delete(`/api/expenses/${id}`).set(as(user.token));
    expect(del.status).toBe(200);

    const again = await request(app).delete(`/api/expenses/${id}`).set(as(user.token));
    expect(again.status).toBe(404);
  });

  it("requires confirmation for delete-all and scopes it to the user", async () => {
    const userA = await createUser();
    const userB = await createUser();
    await request(app).post("/api/expenses").set(as(userA.token)).send(validBody);
    await request(app)
      .post("/api/expenses")
      .set(as(userB.token))
      .send({ ...validBody, category: "Keep" });

    const unconfirmed = await request(app).delete("/api/expenses").set(as(userA.token));
    expect(unconfirmed.status).toBe(400);

    const confirmed = await request(app)
      .delete("/api/expenses")
      .set(as(userA.token))
      .send({ confirm: true });
    expect(confirmed.status).toBe(200);

    const userAList = await request(app).get("/api/expenses").set(as(userA.token));
    expect(userAList.body).toHaveLength(0);
    const userBList = await request(app).get("/api/expenses").set(as(userB.token));
    expect(userBList.body).toHaveLength(1);
  });

  it("supports recurring metadata on create and update", async () => {
    const user = await createUser();
    const created = await request(app)
      .post("/api/expenses")
      .set(as(user.token))
      .send({
        ...validBody,
        recurrence: { frequency: "monthly", nextDueDate: "2026-02-01", isActive: true },
      });
    expect(created.status).toBe(201);
    expect(created.body.recurrence.frequency).toBe("monthly");

    const updated = await request(app)
      .put(`/api/expenses/${created.body._id}/recurring`)
      .set(as(user.token))
      .send({ frequency: "weekly", endDate: "2026-12-31" });
    expect(updated.status).toBe(200);
    expect(updated.body.recurrence.frequency).toBe("weekly");
  });

  it("supports ETag 304 responses for unchanged ledgers", async () => {
    const user = await createUser();
    await request(app).post("/api/expenses").set(as(user.token)).send(validBody);

    const first = await request(app).get("/api/expenses").set(as(user.token));
    expect(first.status).toBe(200);
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    const second = await request(app)
      .get("/api/expenses")
      .set(as(user.token))
      .set("If-None-Match", etag);
    expect(second.status).toBe(304);
  });
});

describe("bulk import", () => {
  it("imports valid rows and reports the count", async () => {
    const user = await createUser();
    const res = await request(app)
      .post("/api/expenses/bulk")
      .set(as(user.token))
      .send({
        rows: [
          { type: "expense", amount: 10, category: "A", date: "2026-01-01" },
          { type: "income", amount: 100, category: "Salary", date: "2026-01-02" },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);

    const list = await request(app).get("/api/expenses").set(as(user.token));
    expect(list.body).toHaveLength(2);
  });

  it("rejects more than 500 rows", async () => {
    const user = await createUser();
    const rows = Array.from({ length: 501 }, (_, i) => ({
      type: "expense",
      amount: 1,
      category: "C",
      date: "2026-01-01",
      note: `row-${i}`,
    }));
    const res = await request(app).post("/api/expenses/bulk").set(as(user.token)).send({ rows });
    expect(res.status).toBe(400);
  });

  it("points at the offending row in validation errors", async () => {
    const user = await createUser();
    const res = await request(app)
      .post("/api/expenses/bulk")
      .set(as(user.token))
      .send({
        rows: [
          { type: "expense", amount: 10, category: "OK", date: "2026-01-01" },
          { type: "expense", amount: -1, category: "Bad", date: "2026-01-02" },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Row 2/);
  });
});

describe("lazy recurring catch-up on ledger read", () => {
  function dueDate(): Date {
    return new Date(Date.now() - 60_000);
  }

  it("generates the user's due recurring entries when the list is fetched", async () => {
    const user = await createUser();
    const due = dueDate();
    await ExpenseModel.create({
      userId: user._id,
      type: "expense",
      amount: 12,
      category: "Subscriptions",
      currency: "USD",
      date: due,
      recurrence: { frequency: "monthly", nextDueDate: due, isActive: true },
    });

    const res = await request(app).get("/api/expenses").set(as(user.token));
    expect(res.status).toBe(200);

    // The generated entry (recurrence cleared) is already in the response.
    // The recurring template itself is also listed (with recurrence set), so
    // filter on recurrence === null to isolate the generated entry.
    const generated = res.body.filter(
      (e: any) => e.category === "Subscriptions" && e.recurrence === null
    );
    expect(generated).toHaveLength(1);
    expect(generated[0].amount).toBe(12);

    // The template itself still exists and was advanced.
    const template = await ExpenseModel.findOne({ userId: user._id, "recurrence.isActive": true });
    expect(template).toBeTruthy();
  });

  it("does not touch another user's templates", async () => {
    const withDue = await createUser();
    const other = await createUser();
    const due = dueDate();
    await ExpenseModel.create({
      userId: withDue._id,
      type: "expense",
      amount: 5,
      category: "Due",
      currency: "USD",
      date: due,
      recurrence: { frequency: "daily", nextDueDate: due, isActive: true },
    });
    await ExpenseModel.create({
      userId: other._id,
      type: "expense",
      amount: 5,
      category: "Other",
      currency: "USD",
      date: due,
      recurrence: { frequency: "daily", nextDueDate: due, isActive: true },
    });

    await request(app).get("/api/expenses").set(as(withDue.token));

    const otherGenerated = await ExpenseModel.find({ userId: other._id, recurrence: null });
    expect(otherGenerated).toHaveLength(0);
  });

  it("does not generate anything when the template is not due yet", async () => {
    const user = await createUser();
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await ExpenseModel.create({
      userId: user._id,
      type: "expense",
      amount: 9,
      category: "Future",
      currency: "USD",
      date: future,
      recurrence: { frequency: "daily", nextDueDate: future, isActive: true },
    });

    await request(app).get("/api/expenses").set(as(user.token));

    const generated = await ExpenseModel.find({ userId: user._id, recurrence: null });
    expect(generated).toHaveLength(0);
  });
});
