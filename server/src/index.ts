import { config } from "./config.js";
import app from "./app.js";
import { startRecurringScheduler } from "./lib/recurringScheduler.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});

// The standalone server is a long-running process (local dev, or a dedicated
// worker host), so the 60s timer is reliable here. Serverless deployments
// (Vercel) must NOT call this — see app.ts for the cron endpoint instead.
startRecurringScheduler();
