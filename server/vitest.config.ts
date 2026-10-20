import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    // Run test files serially so only one MongoMemoryServer instance is created at a time
    fileParallelism: false,
    // How long a single test can take before it times out.  Auth tests are slow
    // because bcrypt is intentionally slow (12 rounds).
    testTimeout: 30_000,
    // Increase the hook timeout so that the mongodb-memory-server binary
    // download completes on a cold run without triggering the beforeAll timeout.
    // On subsequent runs the binary is cached and startup is fast.
    hookTimeout: 900_000, // 15 minutes
  },
});
