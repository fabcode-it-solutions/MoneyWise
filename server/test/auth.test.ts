import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, clearDb, stopTestDb } from "./helpers/db.js";
import { createUser, uniqueEmail } from "./helpers/auth.js";
import authRouter from "../src/routes/auth.js";
import { ExpenseModel } from "../src/models/Expense.js";
import { SummaryModel } from "../src/models/Summary.js";
import { SpaceModel } from "../src/models/Space.js";
import { UserModel } from "../src/models/User.js";
import { getSpaceConnection } from "../src/lib/spaceDb.js";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use("/api/auth", authRouter);

const VALID_PASSWORD = "StrongPass1!";

beforeAll(async () => {
  await startTestDb();
});

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await stopTestDb();
});

describe("register", () => {
  it("creates a user and returns a session", async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: VALID_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.token).toBeTruthy();

    const cookie = res.headers["set-cookie"] as unknown as string[];
    const session = cookie.find((c) => c.startsWith("sw_session="));
    expect(session).toBeDefined();
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Strict");
  });

  it("rejects malformed emails", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: VALID_PASSWORD });
    expect(res.status).toBe(400);
  });

  it("rejects weak passwords with a helpful message", async () => {
    const cases = [
      "short1!", // too short
      "alllowercase1!", // no uppercase
      "ALLUPPERCASE1!", // no lowercase
      "NoNumberHere!", // no digit
      "NoSpecialChar1", // no special
      "A".repeat(73) + "a1!", // over 72 bytes
    ];
    for (const password of cases) {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: uniqueEmail(), password });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/password/i);
    }
  });

  it("rejects duplicate emails with 409", async () => {
    const email = uniqueEmail();
    const first = await request(app)
      .post("/api/auth/register")
      .send({ email, password: VALID_PASSWORD });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/auth/register")
      .send({ email, password: VALID_PASSWORD });
    expect(second.status).toBe(409);
  });
});

describe("login", () => {
  it("logs in with correct credentials", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ email, password: VALID_PASSWORD });

    const res = await request(app).post("/api/auth/login").send({ email, password: VALID_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("rejects a wrong password", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ email, password: VALID_PASSWORD });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "WrongPass1!" });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown email without leaking account existence", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail(), password: VALID_PASSWORD });
    expect(res.status).toBe(401);
  });
});

describe("session + profile", () => {
  async function registerAndGetToken(): Promise<{ email: string; token: string }> {
    const email = uniqueEmail();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: VALID_PASSWORD });
    return { email, token: res.body.token as string };
  }

  it("returns the profile for an authenticated request", async () => {
    const { email, token } = await registerAndGetToken();
    const res = await request(app).get("/api/auth/me").set("Cookie", [`sw_session=${token}`]);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
  });

  it("rejects /me without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("updates a valid timezone and rejects an invalid one", async () => {
    const { token } = await registerAndGetToken();

    const ok = await request(app)
      .put("/api/auth/timezone")
      .set("Cookie", [`sw_session=${token}`])
      .send({ timezone: "Asia/Kolkata" });
    expect(ok.status).toBe(200);

    const bad = await request(app)
      .put("/api/auth/timezone")
      .set("Cookie", [`sw_session=${token}`])
      .send({ timezone: "Mars/Olympus" });
    expect(bad.status).toBe(400);
  });
});

describe("password change", () => {
  it("invalidates all existing sessions after a password change", async () => {
    const email = uniqueEmail();
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ email, password: VALID_PASSWORD });
    const oldToken = reg.body.token as string;
    const oldCookie = [`sw_session=${oldToken}`];

    // Wrong current password is rejected and does not revoke the session.
    const wrong = await request(app)
      .put("/api/auth/password")
      .set("Cookie", oldCookie)
      .send({ currentPassword: "WrongPass1!", newPassword: "NewStrongPass2!" });
    expect(wrong.status).toBe(401);
    const stillValid = await request(app).get("/api/auth/me").set("Cookie", oldCookie);
    expect(stillValid.status).toBe(200);

    // Correct change bumps tokenVersion: old token is dead, new token works.
    const change = await request(app)
      .put("/api/auth/password")
      .set("Cookie", oldCookie)
      .send({ currentPassword: VALID_PASSWORD, newPassword: "NewStrongPass2!" });
    expect(change.status).toBe(200);

    const oldTokenRejected = await request(app).get("/api/auth/me").set("Cookie", oldCookie);
    expect(oldTokenRejected.status).toBe(401);

    const newToken = change.body.token as string;
    const newTokenWorks = await request(app)
      .get("/api/auth/me")
      .set("Cookie", [`sw_session=${newToken}`]);
    expect(newTokenWorks.status).toBe(200);
  });
});

describe("account deletion", () => {
  it("requires confirmation", async () => {
    const { token } = await createUser();
    const res = await request(app)
      .delete("/api/auth/account")
      .set("Cookie", [`sw_session=${token}`]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirmation/i);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .delete("/api/auth/account")
      .send({ confirm: true });
    expect(res.status).toBe(401);
  });

  it("deletes the user's personal expenses, summaries, and owned Hubs", async () => {
    const { _id, token } = await createUser();

    await ExpenseModel.create({
      userId: _id,
      type: "expense",
      amount: 25,
      category: "Food",
      date: new Date(),
    });
    await SummaryModel.create({
      userId: _id,
      weekStartDate: "2026-07-27",
      weekEndDate: "2026-08-02",
      timezone: "UTC",
      narrative: "test summary",
      stats: { totalIncome: 0, totalExpense: 25, net: -25, transactionCount: 1, byCategory: [] },
    });
    const space = await SpaceModel.create({
      name: "My Hub",
      ownerId: _id,
      members: [{ userId: _id, nickname: "me", role: "owner", status: "active" }],
    });
    const spaceDb = getSpaceConnection(space._id.toString());
    await spaceDb.collection("expenses").insertOne({ authorUserId: _id, amount: 10, category: "X" });

    const res = await request(app)
      .delete("/api/auth/account")
      .set("Cookie", [`sw_session=${token}`])
      .send({ confirm: true });
    expect(res.status).toBe(200);

    expect(await UserModel.findById(_id)).toBeNull();
    expect(await ExpenseModel.countDocuments({ userId: _id })).toBe(0);
    expect(await SummaryModel.countDocuments({ userId: _id })).toBe(0);
    expect(await SpaceModel.countDocuments({ ownerId: _id })).toBe(0);
    // The per-Hub database is dropped too.
    const db = spaceDb.db!;
    const remaining = await db.listCollections().toArray();
    expect(remaining.length).toBe(0);
  });

  it("removes the user from Hubs they only belong to, keeping the Hub alive", async () => {
    const owner = await createUser();
    const member = await createUser();

    const space = await SpaceModel.create({
      name: "Shared Hub",
      ownerId: owner._id,
      members: [
        { userId: owner._id, nickname: "owner", role: "owner", status: "active" },
        { userId: member._id, nickname: "guest", role: "member", status: "active" },
      ],
    });

    const res = await request(app)
      .delete("/api/auth/account")
      .set("Cookie", [`sw_session=${member.token}`])
      .send({ confirm: true });
    expect(res.status).toBe(200);

    const after = await SpaceModel.findById(space._id);
    expect(after).not.toBeNull();
    expect(after!.members.some((m) => String(m.userId) === member._id.toString())).toBe(false);
    expect(after!.members.some((m) => String(m.userId) === owner._id.toString())).toBe(true);
    // The member's own account is gone.
    expect(await UserModel.findById(member._id)).toBeNull();
  });

  it("kills the session cookie so the deleted user cannot authenticate", async () => {
    const { _id, token } = await createUser();

    const res = await request(app)
      .delete("/api/auth/account")
      .set("Cookie", [`sw_session=${token}`])
      .send({ confirm: true });
    expect(res.status).toBe(200);

    // The user is deleted, so /me with the same token must fail.
    const me = await request(app).get("/api/auth/me").set("Cookie", [`sw_session=${token}`]);
    expect(me.status).toBe(401);
    expect(await UserModel.findById(_id)).toBeNull();
  });
});
