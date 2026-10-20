/**
 * Shared test helper: spins up an in-memory MongoDB instance once for the
 * whole test suite (not once per test), which keeps the test run fast.
 *
 * Pin the mongod binary version via MONGOMS_VERSION so CI can cache it and
 * the download does not depend on the server's "latest" moving target.
 */

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll } from "vitest";

// The version that mongodb-memory-server downloads.  Pin it explicitly so
// CI can cache the binary and avoid re-downloading on every run.
// Keep this in sync with your production MongoDB version.
process.env["MONGOMS_VERSION"] = "7.0.14";

let mongod: MongoMemoryServer;

export async function startDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function stopDb(): Promise<void> {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
}

export async function clearDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
  }
}

// Register lifecycle hooks so callers just need to import this module.
beforeAll(startDb);
afterAll(stopDb);
