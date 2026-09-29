// Runs before any test module is evaluated (per worker). The in-memory MongoDB
// is started once for the whole run by test/global-setup.ts, which exposes its
// URI as TEST_MONGODB_URI. src/config.ts reads environment variables at import
// time, so point MONGODB_URI at the real memory server BEFORE any src module
// loads. The port-1 fallback fails fast (ECONNREFUSED) if globalSetup somehow
// didn't run.
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:1/moneywise-test";
process.env.JWT_SECRET ??= "test-only-jwt-secret-0123456789abcdef";
process.env.CSRF_SECRET ??= "test-only-csrf-secret-0123456789abcdef";
process.env.CRON_SECRET ??= "test-only-cron-secret-0123456789abcdef";
process.env.FRONTEND_URL ??= "http://localhost:5173";
// The AI chat route guards on config.groqApiKey before constructing the
// (mocked) Groq client; a placeholder keeps it from 503ing in tests.
process.env.GROQ_API_KEY ??= "test-only-groq-key";
