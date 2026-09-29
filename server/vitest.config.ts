import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    // One in-memory MongoDB for the whole run, started/stopped by the global
    // hooks — avoids spawning a mongod per test file (which churned detached
    // child processes and could race disconnect/reconnect between files).
    globalSetup: ["./test/global-setup.ts"],
    globalTeardown: ["./test/global-teardown.ts"],
    // Run test files sequentially in one worker so only one mongod is ever
    // alive at a time. The suite is small enough that serial execution stays
    // fast.
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
