import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { describe, expect, it } from "vitest";
import { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } from "../src/middleware/csrf.js";

// Mirrors the middleware order in src/app.ts: CSRF applies to state-changing
// requests unless they carry a Bearer token (mobile clients).
function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  app.get("/csrf", (req, res) => {
    const token = generateCsrfToken(req, res);
    res.json({ token });
  });

  app.use((req, res, next) => {
    if (req.headers.authorization?.startsWith("Bearer ")) return next();
    doubleCsrfProtection(req, res, next);
  });

  app.post("/action", (req, res) => {
    res.json({ ok: true });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err === invalidCsrfTokenError) {
      res.status(403).json({ error: "Invalid CSRF token" });
      return;
    }
    next(err);
  });

  return app;
}

function cookieFrom(res: request.Response, name: string): string {
  const setCookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  const raw = (setCookies ?? []).find((c) => c.startsWith(`${name}=`));
  if (!raw) throw new Error(`Missing cookie ${name}`);
  return raw.split(";")[0];
}

describe("CSRF protection", () => {
  it("issues a token bound to the session cookie", async () => {
    const app = buildApp();
    const res = await request(app).get("/csrf");
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(cookieFrom(res, "sw_csrf")).toBeTruthy();
  });

  it("rejects state-changing requests without a token", async () => {
    const app = buildApp();
    const res = await request(app).post("/action").send({});
    expect(res.status).toBe(403);
  });

  it("rejects a token without the matching cookie", async () => {
    const app = buildApp();
    const csrf = await request(app).get("/csrf");
    const res = await request(app)
      .post("/action")
      .set("x-csrf-token", csrf.body.token)
      .send({});
    expect(res.status).toBe(403);
  });

  it("rejects a cookie without the token header", async () => {
    const app = buildApp();
    const csrf = await request(app).get("/csrf");
    const cookie = cookieFrom(csrf, "sw_csrf");
    const res = await request(app).post("/action").set("Cookie", cookie).send({});
    expect(res.status).toBe(403);
  });

  it("accepts a matching cookie + token pair", async () => {
    const app = buildApp();
    const csrf = await request(app).get("/csrf");
    const cookie = cookieFrom(csrf, "sw_csrf");
    const res = await request(app)
      .post("/action")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrf.body.token)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("exempts Bearer-token requests (mobile clients)", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/action")
      .set("Authorization", "Bearer some-mobile-token")
      .send({});
    expect(res.status).toBe(200);
  });
});
