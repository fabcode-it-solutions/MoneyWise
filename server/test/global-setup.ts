import { resolve } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Runs once in the main process before any worker starts. Starts a single
 * in-memory MongoDB for the whole test run and exposes its URI to every worker
 * via process.env.TEST_MONGODB_URI (workers inherit the main process env).
 *
 * Pinning MongoDB 6.0: 7.x x64 binaries require AVX2 and SIGABRT on older CPUs
 * (e.g. the Intel i5-6360U this project is developed on).
 */
export default async function globalSetup(): Promise<void> {
  process.env.MONGOMS_VERSION ??= "6.0.19";
  process.env.MONGOMS_DOWNLOAD_DIR ??= resolve(import.meta.dirname, "..", ".mongodb-binaries");

  const mongod = await MongoMemoryServer.create();
  process.env.TEST_MONGODB_URI = mongod.getUri();
  (globalThis as Record<string, unknown>).__TEST_MONGOD__ = mongod;
}
