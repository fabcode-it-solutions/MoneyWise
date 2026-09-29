import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, clearDb, stopTestDb } from "./helpers/db.js";
import { createUser } from "./helpers/auth.js";
import { ExpenseModel } from "../src/models/Expense.js";
import { SpaceModel } from "../src/models/Space.js";
import { getSpaceExpenseModel } from "../src/lib/spaceDb.js";

// C8: The chat endpoint calls Groq with tool definitions and runs any tool
// calls it receives against the user's ledger. Script the Groq client so we
// can exercise the tool-execution path without a real API key.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("groq-sdk", () => {
  return {
    default: class {
      chat = { completions: { create: createMock } };
    },
  };
});

import aiRouter from "../src/routes/ai.js";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use("/api/ai", aiRouter);

function as(token: string) {
  return { Cookie: [`sw_session=${token}`] };
}

function toolCallMessage(name: string, args: Record<string, unknown>) {
  return {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

function finalMessage(content: string) {
  return { choices: [{ message: { role: "assistant", content } }], usage: { total_tokens: 5 } };
}

function scriptToolRound(name: string, args: Record<string, unknown>, reply: string) {
  createMock
    .mockResolvedValueOnce({ choices: [{ message: toolCallMessage(name, args) }], usage: { total_tokens: 5 } })
    .mockResolvedValueOnce(finalMessage(reply));
}

beforeAll(async () => {
  await startTestDb();
});

beforeEach(async () => {
  await clearDb();
  createMock.mockReset();
});

afterAll(async () => {
  await stopTestDb();
});

describe("AI chat agentic tools", () => {
  it("adds a transaction to the personal ledger when the model calls add_transaction", async () => {
    const { _id, token } = await createUser();
    scriptToolRound(
      "add_transaction",
      { type: "expense", amount: 12.5, category: "Food & Dining", note: "lunch" },
      "Added $12.50 to Food & Dining."
    );

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "log $12.50 for lunch" });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Added $12.50 to Food & Dining.");
    expect(res.body.dataChanged).toBe(true);

    const created = await ExpenseModel.findOne({ userId: _id });
    expect(created).not.toBeNull();
    expect(created!.amount).toBe(12.5);
    expect(created!.category).toBe("Food & Dining");
    expect(created!.note).toBe("lunch");
  });

  it("edits an existing personal transaction via edit_transaction", async () => {
    const { _id, token } = await createUser();
    const expense = await ExpenseModel.create({
      userId: _id,
      type: "expense",
      amount: 40,
      category: "Groceries",
      date: new Date(),
    });

    scriptToolRound(
      "edit_transaction",
      { id: expense._id.toString(), amount: 35.5, category: "Shopping" },
      "Updated the grocery charge to $35.50."
    );

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "change yesterday's grocery amount to 35.50" });

    expect(res.status).toBe(200);
    expect(res.body.dataChanged).toBe(true);

    const updated = await ExpenseModel.findById(expense._id);
    expect(updated!.amount).toBe(35.5);
    expect(updated!.category).toBe("Shopping");
  });

  it("adds a transaction to a Hub's shared ledger when spaceId is provided", async () => {
    const { _id, token } = await createUser();
    const space = await SpaceModel.create({
      name: "Family",
      ownerId: _id,
      members: [{ userId: _id, nickname: "Ranji", role: "owner", status: "active" }],
    });

    scriptToolRound(
      "add_transaction",
      { type: "expense", amount: 89.9, category: "Utilities", note: "electric bill" },
      "Logged the electric bill in Family."
    );

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "log the $89.90 electric bill", spaceId: space._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.dataChanged).toBe(true);

    const created = await getSpaceExpenseModel(space._id.toString()).findOne({});
    expect(created).not.toBeNull();
    expect(created!.amount).toBe(89.9);
    expect(created!.authorUserId.toString()).toBe(_id.toString());
    // Hub expenses must not leak into the personal ledger.
    const personalCount = await ExpenseModel.countDocuments({ userId: _id });
    expect(personalCount).toBe(0);
  });

  it("edits a Hub's shared transaction via edit_transaction", async () => {
    const { _id, token } = await createUser();
    const space = await SpaceModel.create({
      name: "Family",
      ownerId: _id,
      members: [{ userId: _id, nickname: "Ranji", role: "owner", status: "active" }],
    });
    const spaceModel = getSpaceExpenseModel(space._id.toString());
    const expense = await spaceModel.create({
      authorUserId: _id,
      type: "expense",
      amount: 60,
      category: "Groceries",
      date: new Date(),
    });

    scriptToolRound(
      "edit_transaction",
      { id: expense._id.toString(), amount: 45 },
      "Updated the Hub grocery charge to $45."
    );

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "make that grocery charge 45", spaceId: space._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.dataChanged).toBe(true);
    const updated = await spaceModel.findById(expense._id);
    expect(updated!.amount).toBe(45);
  });

  it("deletes a Hub's shared transaction via delete_transaction", async () => {
    const { _id, token } = await createUser();
    const space = await SpaceModel.create({
      name: "Family",
      ownerId: _id,
      members: [{ userId: _id, nickname: "Ranji", role: "owner", status: "active" }],
    });
    const spaceModel = getSpaceExpenseModel(space._id.toString());
    const expense = await spaceModel.create({
      authorUserId: _id,
      type: "expense",
      amount: 12,
      category: "Shopping",
      date: new Date(),
    });

    scriptToolRound(
      "delete_transaction",
      { id: expense._id.toString() },
      "Deleted the Hub transaction."
    );

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "delete that purchase", spaceId: space._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.dataChanged).toBe(true);
    expect(await spaceModel.findById(expense._id)).toBeNull();
  });

  it("does not let personal chat touch a Hub transaction (ledger isolation)", async () => {
    const { _id, token } = await createUser();
    const space = await SpaceModel.create({
      name: "Family",
      ownerId: _id,
      members: [{ userId: _id, nickname: "Ranji", role: "owner", status: "active" }],
    });
    const spaceModel = getSpaceExpenseModel(space._id.toString());
    const expense = await spaceModel.create({
      authorUserId: _id,
      type: "expense",
      amount: 12,
      category: "Shopping",
      date: new Date(),
    });

    // Personal chat tries to edit a Hub transaction id it should never see.
    scriptToolRound(
      "edit_transaction",
      { id: expense._id.toString(), amount: 999 },
      "Could not find that transaction."
    );

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "change that to 999" });

    expect(res.status).toBe(200);
    const untouched = await spaceModel.findById(expense._id);
    expect(untouched!.amount).toBe(12);
  });

  it("rejects chat against a Hub the user is not a member of", async () => {
    const user = await createUser();
    const owner = await createUser();
    const space = await SpaceModel.create({
      name: "Private Hub",
      ownerId: owner._id,
      members: [{ userId: owner._id, nickname: "Owner", role: "owner", status: "active" }],
    });

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(user.token))
      .send({ message: "log $5 for coffee", spaceId: space._id.toString() });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Not a member");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid spaceId format", async () => {
    const { token } = await createUser();
    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "log $5 for coffee", spaceId: "not-an-object-id" });
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("does not persist anything when the model declines to call a tool", async () => {
    const { _id, token } = await createUser();
    createMock.mockResolvedValueOnce(finalMessage("You have no transactions yet."));

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "what did I spend last week?" });

    expect(res.status).toBe(200);
    expect(res.body.dataChanged).toBe(false);
    expect(await ExpenseModel.countDocuments({ userId: _id })).toBe(0);
  });

  it("instructs the model to never reveal transaction ids to the user", async () => {
    const { _id, token } = await createUser();
    const expense = await ExpenseModel.create({
      userId: _id,
      type: "expense",
      amount: 40,
      category: "Groceries",
      date: new Date(),
    });
    createMock.mockResolvedValueOnce(finalMessage("You have no transactions yet."));

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "what did I spend?" });

    expect(res.status).toBe(200);

    // The history still needs the bracketed id so the model can target the
    // edit/delete tools, but the prompt must keep ids out of user-facing text.
    const systemPrompt = createMock.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).toContain(`[${expense._id}]`);
    expect(systemPrompt).toMatch(/never show a transaction id to the user/i);
    expect(systemPrompt).toMatch(/describe the transaction by its date, category, amount, and name\/note/i);
  });

  it("instructs the model to reply in Spanish when lang is es", async () => {
    const { token } = await createUser();
    createMock.mockResolvedValueOnce(finalMessage("Hola, has gastado $40."));

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "¿cuánto gasté?", lang: "es" });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Hola, has gastado $40.");

    const systemPrompt = createMock.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).toMatch(/reply in spanish/i);
  });

  it("keeps the English default when lang is omitted", async () => {
    const { token } = await createUser();
    createMock.mockResolvedValueOnce(finalMessage("You spent $40."));

    const res = await request(app)
      .post("/api/ai/chat")
      .set(as(token))
      .send({ message: "how much did I spend?" });

    expect(res.status).toBe(200);
    const systemPrompt = createMock.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).not.toMatch(/reply in spanish/i);
  });
});
