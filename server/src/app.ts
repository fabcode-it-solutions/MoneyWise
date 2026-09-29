import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import passport from "./middleware/passport.js";
import { getDB } from "./db.js";
import authRoutes from "./routes/auth.js";
import expenseRoutes from "./routes/expenses.js";
import spaceRoutes from "./routes/spaces.js";
import spaceExpenseRoutes from "./routes/spaceExpenses.js";
import aiRoutes from "./routes/ai.js";
import currencyRoutes from "./routes/currency.js";
import summaryRoutes from "./routes/summaries.js";
import cronRoutes from "./routes/cron.js";
import { config } from "./config.js";
import { doubleCsrfProtection, invalidCsrfTokenError } from "./middleware/csrf.js";

const app = express();

// C2: Tell Express to trust Vercel's reverse proxy so req.ip is the real client IP
// and express-rate-limit uses the correct IP instead of the proxy's shared IP.
app.set("trust proxy", 1);

// Helmet applies only to Express API responses (/api/*, /health).
// Static files (index.html, CDN scripts) are served by Vercel, so
// COOP/CORP headers here do not interfere with CDN-loaded assets.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "https://*.pusher.com", "wss://*.pusher.com"],
      },
    },
  })
);

// Expense ledgers are JSON arrays that compress well; this cuts payload size
// for the initial load and every subsequent poll/Pusher-triggered refetch.
app.use(compression());

app.use(passport.initialize());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Rejected origin: ${origin}`);
        callback(null, false);
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    // x-csrf-token must be in allowedHeaders for browsers to send it cross-origin
    allowedHeaders: ["Content-Type", "x-csrf-token", "Authorization"],
    credentials: true,
  })
);

app.use(cookieParser());
// Receipt upload sends base64 image in JSON — needs a higher limit than the global 10kb
app.use("/api/ai/parse-receipt", express.json({ limit: "2mb" }));
app.use("/api/ai/parse-receipts-bulk", express.json({ limit: "10mb" }));
app.use(express.json({ limit: "10kb" }));
app.use(mongoSanitize());

// C1: Reject state-changing requests without an application/json Content-Type.
// Check the header directly rather than req.is(): req.is() returns false for a
// legitimate empty DELETE body, even when the request declares JSON.
// This still closes the <form enctype="text/plain"> CSRF bypass vector.
app.use((req, res, next) => {
  const contentType = req.headers["content-type"]?.toLowerCase() ?? "";
  if (
    ["POST", "PUT", "DELETE", "PATCH"].includes(req.method) &&
    !contentType.startsWith("application/json")
  ) {
    res.status(415).json({ error: "Content-Type must be application/json" });
    return;
  }
  next();
});

// C4: Rate-limit auth endpoints — 10 attempts per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
});

// C3: Rate-limit expense endpoints — 200 requests per 15 min per IP
const expenseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// getDB() caches the connection and resets on disconnect so serverless
// warm starts reuse existing connections and dropped connections self-heal.
app.use((_req, _res, next) => {
  getDB().then(() => next()).catch(next);
});

app.get("/health", async (_req, res) => {
  try {
    await getDB();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: "Database unavailable" });
  }
});

// C1: Apply CSRF protection to all state-changing routes.
// Bearer-token requests (mobile app) are exempt — CSRF is a browser-cookie attack vector only.
// GET /api/auth/csrf is exempt because CSRF middleware ignores GET requests.
app.use((req, res, next) => {
  if (req.headers.authorization?.startsWith("Bearer ")) return next();
  doubleCsrfProtection(req, res, next);
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/expenses", expenseLimiter, expenseRoutes);
app.use("/api/spaces/:spaceId/expenses", expenseLimiter, spaceExpenseRoutes);
app.use("/api/spaces", expenseLimiter, spaceRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/currency", expenseLimiter, currencyRoutes);
app.use("/api/summaries", expenseLimiter, summaryRoutes);
// Protected scheduler endpoint (GitHub Actions workflow) — runs the
// recurring transaction scan. Not called by browser clients. The recurring
// scheduler must NOT run on setInterval here: Vercel functions scale to zero,
// so a timer would only tick while a request is keeping an instance alive.
// Per-user lazy catch-up on ledger reads keeps correctness regardless.
app.use("/api/cron", cronRoutes);

// C1: Handle CSRF validation failures with a clear 403 before the generic handler
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err === invalidCsrfTokenError) {
    res.status(403).json({ error: "Invalid CSRF token" });
    return;
  }
  next(err);
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Express Error Handler:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
