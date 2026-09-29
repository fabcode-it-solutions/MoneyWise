import mongoose from "mongoose";

// The in-memory MongoDB is started once for the whole test run by
// test/global-setup.ts, which exposes its URI as TEST_MONGODB_URI. Vitest
// always runs globalSetup (even for a single filtered file), so this helper
// only manages the mongoose connection lifecycle.

export async function startTestDb(): Promise<string> {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    throw new Error(
      "TEST_MONGODB_URI is not set. Run tests with vitest so test/global-setup.ts can start the in-memory MongoDB."
    );
  }
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
  return uri;
}

export async function clearDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));

  // Space ledgers live in their own `space_<id>` databases (mongoose.useDb).
  // Drop them so recurring/space tests start clean without cross-test leakage.
  const spaceConns = mongoose.connections.filter(
    (c) => c !== mongoose.connection && c.name.startsWith("space_")
  );
  await Promise.all(spaceConns.map((c) => c.dropDatabase()));
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
}
