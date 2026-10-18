import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import {
  API_URL,
  CLIENT_PORT,
  CLIENT_URL,
  E2E_MONGODB_URI,
  SERVER_PORT,
  WS_URL,
} from "./e2e/support/env";

// Resolved from this file's location so the command works no matter which
// folder `npm run test:e2e` is started from.
const serverDirectory = fileURLToPath(new URL("../server", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",

  // Every test starts by emptying the shared test database, so two tests running
  // at the same moment would delete each other's data. One worker avoids that.
  fullyParallel: false,
  workers: 1,

  // A stray test.only would silently skip the rest of the suite in CI.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: CLIENT_URL,
    // The trace is the best tool for debugging a failed drag or a timing issue,
    // but recording it for passing tests would only waste time and disk space.
    trace: "retain-on-failure",
  },

  // Chromium only, as requested. Add Firefox or WebKit projects here later.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: [
    {
      name: "server",
      // Plain `tsx` instead of `npm run dev`: no file watcher is needed in a test run.
      command: "npx tsx src/index.ts",
      cwd: serverDirectory,
      // The server only starts listening after MongoDB is connected, so a
      // healthy /api/health also means "the database is reachable".
      url: `${API_URL}/api/health`,
      // Variables set here win over the ones in server/.env (dotenv never
      // overrides existing variables). That is what keeps the tests away from
      // the real development database.
      env: {
        PORT: SERVER_PORT,
        MONGODB_URI: E2E_MONGODB_URI,
        CLIENT_ORIGIN: CLIENT_URL,
      },
      // Never reuse a running server: it might be your dev server, connected to real data.
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: "client",
      command: `npm run dev -- --host 127.0.0.1 --port ${CLIENT_PORT} --strictPort`,
      url: CLIENT_URL,
      // Vite exposes VITE_* variables from the environment, and these take
      // priority over client/.env. The client therefore talks to the test server.
      env: {
        VITE_API_URL: API_URL,
        VITE_WS_URL: WS_URL,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
