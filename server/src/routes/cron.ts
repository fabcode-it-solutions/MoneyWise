import { Router } from "express";
import { config } from "../config.js";
import { processRecurringTransactions } from "../lib/recurringScheduler.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/**
 * Protected endpoints invoked by schedulers (the GitHub Actions recurring-cron
 * workflow) — never by browser clients.
 *
 * The GitHub Actions workflow sends the CRON_SECRET value as an Authorization
 * header; the endpoint is a GET so the CSRF middleware (which only guards
 * state-changing requests) never touches it, and its only side effect is the
 * idempotent, atomically-claimed recurring scan.
 */
const router = Router();

router.get(
  "/recurring",
  (req, res, next) => {
    const auth = req.headers.authorization ?? "";
    if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  },
  asyncHandler(async (_req, res) => {
    await processRecurringTransactions();
    res.json({ ok: true });
  })
);

export default router;
