import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, clearDb, stopTestDb } from "./helpers/db.js";
import { createUser } from "./helpers/auth.js";
import { ExpenseModel } from "../src/models/Expense.js";
import type { Types } from "mongoose";

// Script Groq so the summary generation path runs without a real API key.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("groq-sdk", () => {
  return {
    default: class {
      chat = { completions: { create: createMock } };
    },
  };
});

import summariesRouter from "../src/routes/summaries.js";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use("/api/summaries", summariesRouter);

function as(token: string) {
  return { Cookie: [`sw_session=${token}`] };
}

// Mirrors getWeekRange(timezone, 1): last week's Monday..Sunday in UTC.
function lastWeekRangeUTC() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday - 7));
  return monday.toISOString().slice(0, 10);
}

async function seedLastWeekExpense(userId: Types.ObjectId) {
  const startKey = lastWeekRangeUTC();
  await ExpenseModel.create({
    userId,
    type: "expense",
    amount: 42,
    category: "Food & Dining",
    date: new Date(`${startKey}T12:00:00.000Z`),
  });
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

describe("GET /api/summaries language", () => {
  it("generates a Spanish fallback narrative when lang=es and Groq fails", async () => {
    const { _id, token } = await createUser();
    await seedLastWeekExpense(_id);
    createMock.mockRejectedValue(new Error("groq down"));

    const res = await request(app).get("/api/summaries?lang=es").set(as(token));

    expect(res.status).toBe(200);
    expect(res.body.summaries).toHaveLength(1);
    expect(res.body.summaries[0].narrative).toMatch(/Esta semana gastaste/);
  });

  it("instructs the model to write in Spanish when lang=es", async () => {
    const { _id, token } = await createUser();
    await seedLastWeekExpense(_id);
    createMock.mockResolvedValue({
      choices: [{ message: { content: "Resumen semanal en español." } }],
    });

    const res = await request(app).get("/api/summaries?lang=es").set(as(token));

    expect(res.status).toBe(200);
    const prompt = createMock.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toMatch(/in Spanish \(es\)/i);
  });

  it("keeps the English fallback when lang is omitted", async () => {
    const { _id, token } = await createUser();
    await seedLastWeekExpense(_id);
    createMock.mockRejectedValue(new Error("groq down"));

    const res = await request(app).get("/api/summaries").set(as(token));

    expect(res.status).toBe(200);
    expect(res.body.summaries[0].narrative).toMatch(/This week you spent/);
  });
});
