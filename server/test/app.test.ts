import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { startTestDb, clearDb, stopTestDb } from "./helpers/db.js";

// IMPORTANT: this file must run before any other test file imports src modules
// that pull in src/config.ts, because the first import of config.ts freezes
// MONGODB_URI. We start the in-memory DB and set the env var BEFORE dynamically
// importing the full app. "app.test.ts" sorts before every other test file in
// the single-worker sequential vitest run, and no other test file statically
// imports src modules before this file executes.
// Do NOT add static imports of src/** modules here (e.g. recurringScheduler,
// which transitively imports config via pusher) — that would re-freeze the
// placeholder URI. Import them dynamically inside hooks/tests instead.

const VALID_PASSWORD = "StrongPass1!"; // 12 chars, meets password rules

let app: Express;
let ipCounter = 1;
const ip = () => `10.0.0.${ipCounter++}`;

function extractCookie(setCookie: string[] | string | undefined, name: string): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const raw = list.find((c) => c.startsWith(`${name}=`));
  return raw?.split(";")[0];
}

beforeAll(async () => {
  const uri = await startTestDb();
  process.env.MONGODB_URI = uri;
  ({ default: app } = await import("../src/app.js"));
});

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  // Imported dynamically so this module (which transitively loads src/config.ts
  // via pusher.ts) is not evaluated before MONGODB_URI is set in beforeAll.
  const { stopRecurringScheduler } = await import("../src/lib/recurringScheduler.js");
  stopRecurringScheduler();
  await stopTestDb();
});

describe("full app integration", () => {
  it("reports healthy when the database is reachable", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("requires a CSRF token for cookie-based state-changing requests", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", ip())
      .send({ email: `blocked-${Date.now()}@test.com`, password: VALID_PASSWORD });
    expect(res.status).toBe(403);
  });

  it("registers a user end to end and keeps the session cookie valid", async () => {
    const csrfRes = await request(app).get("/api/auth/csrf").set("X-Forwarded-For", ip());
    expect(csrfRes.status).toBe(200);

    const csrfCookie = extractCookie(csrfRes.headers["set-cookie"], "sw_csrf");
    expect(csrfCookie).toBeDefined();

    const email = `user-${Date.now()}@test.com`;
    const regRes = await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", ip())
      .set("Cookie", csrfCookie!)
      .set("x-csrf-token", csrfRes.body.token)
      .send({ email, password: VALID_PASSWORD });
    expect(regRes.status).toBe(201);
    expect(regRes.body.user.email).toBe(email);

    const sessionCookie = extractCookie(regRes.headers["set-cookie"], "sw_session");
    expect(sessionCookie).toBeTruthy();

    const me = await request(app).get("/api/auth/me").set("Cookie", sessionCookie!);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
  });

  it("rejects non-JSON state-changing requests with 415", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", ip())
      .set("Content-Type", "text/plain")
      .send("email=a@b.com&password=whatever");
    expect(res.status).toBe(415);
  });

  it("exempts Bearer-token requests from CSRF and stamps the owning user", async () => {
    // Register to obtain a real session token, then use it as a Bearer token.
    const csrf = await request(app).get("/api/auth/csrf").set("X-Forwarded-For", ip());
    const csrfCookie = extractCookie(csrf.headers["set-cookie"], "sw_csrf");
    const reg = await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", ip())
      .set("Cookie", csrfCookie!)
      .set("x-csrf-token", csrf.body.token)
      .send({ email: `bearer-${Date.now()}@test.com`, password: VALID_PASSWORD });
    expect(reg.status).toBe(201);

    const token = reg.body.token as string;
    const created = await request(app)
      .post("/api/expenses")
      .set("X-Forwarded-For", ip())
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "expense", amount: 42, category: "Test", date: "2026-01-01", currency: "USD" });
    expect(created.status).toBe(201);
    expect(created.body.userId).toBeDefined();
  });

  it("rate-limits repeated requests from the same IP", async () => {
    const fixedIp = "203.0.113.99";
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app).get("/api/auth/csrf").set("X-Forwarded-For", fixedIp);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
