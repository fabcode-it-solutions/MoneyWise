/**
 * Stops the single in-memory MongoDB shared across the whole test run.
 * Runs in the main process after all workers finish.
 */
export default async function globalTeardown(): Promise<void> {
  const mongod = (globalThis as Record<string, unknown>).__TEST_MONGOD__ as
    | { stop(): Promise<void> }
    | undefined;
  if (mongod) await mongod.stop();
}
