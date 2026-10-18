// Shared by playwright.config.ts and the tests, so the URLs exist in one place.
//
// These ports differ from the development ones (4000 and 5173) on purpose: the
// e2e run can then never collide with, or accidentally talk to, a dev server.
// 127.0.0.1 is used instead of "localhost" because "localhost" can resolve to
// the IPv6 address ::1, which the servers may not be listening on.
export const SERVER_PORT = "4100";
export const CLIENT_PORT = "5174";

export const API_URL = `http://127.0.0.1:${SERVER_PORT}`;
export const WS_URL = `ws://127.0.0.1:${SERVER_PORT}/ws`;
export const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;

// Prerequisite: MongoDB must be running. Point the tests at another instance
// by setting E2E_MONGODB_URI, for example:
//   E2E_MONGODB_URI=mongodb://127.0.0.1:27017/my_app_e2e npm run test:e2e
export const E2E_MONGODB_URI =
  process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/kanban_e2e";

// Every test starts by deleting ALL columns and cards in this database. A
// typo in the URI (or a copied production URI) would be disastrous, so refuse to
// run unless the database name says "e2e".
const databaseName = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/.exec(E2E_MONGODB_URI)?.[1];

if (!databaseName || !databaseName.toLowerCase().includes("e2e")) {
  throw new Error(
    `Refusing to run: the e2e database name must contain "e2e" (got "${databaseName ?? "none"}"). ` +
      "The tests wipe this database, so set E2E_MONGODB_URI to something like " +
      "mongodb://127.0.0.1:27017/kanban_e2e",
  );
}
