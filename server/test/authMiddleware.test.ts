import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, clearDb, stopTestDb } from "./helpers/db.js";
import { createUser } from "./helpers/auth.js";
import { authRequired } from "../src/middleware/auth.js";
import { UserModel } from "../src/models/User.js";

const app = express();
app.use(cookieParser());
app.get("/protected", authRequired, (req, res) => {
  res.json({ userId: req.userId });
});

beforeAll(async () => {
  await startTestDb();
});

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await stopTestDb();
});

describe("authRequired middleware", () => {
  it("rejects requests without a session", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const { _id } = await createUser();
    const forged = jwt.sign({ userId: _id.toString(), tv: 0 }, "attacker-controlled-secret", {
      expiresIn: "7d",
    });
    const res = await request(app).get("/protected").set("Cookie", [`sw_session=${forged}`]);
    expect(res.status).toBe(401);
  });

  it("rejects a token whose user no longer exists", async () => {
    const { _id } = await createUser();
    await UserModel.deleteOne({ _id });
    const res = await request(app).get("/protected").set("Cookie", [`sw_session=${jwt.sign({ userId: _id.toString(), tv: 0 }, process.env.JWT_SECRET!, { expiresIn: "7d" })}`]);
    expect(res.status).toBe(401);
  });

  it("rejects a token with a stale tokenVersion", async () => {
    const { _id, token } = await createUser();
    await UserModel.updateOne({ _id }, { $inc: { tokenVersion: 1 } });
    const res = await request(app).get("/protected").set("Cookie", [`sw_session=${token}`]);
    expect(res.status).toBe(401);
  });

  it("accepts a valid session and exposes the userId", async () => {
    const { _id, token } = await createUser();
    const res = await request(app).get("/protected").set("Cookie", [`sw_session=${token}`]);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(_id.toString());
  });
});
