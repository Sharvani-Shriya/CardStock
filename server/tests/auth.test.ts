/**
 * Integration tests for POST /api/auth/* routes.
 *
 * Each test creates the Express app (no real HTTP port opened) and drives it
 * through supertest.  The database is an in-memory MongoDB instance provided
 * by mongodb-memory-server, so the real Atlas/local mongod is never touched.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { config } from "../src/config.js";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { RefreshToken } from "../src/models/RefreshToken.js";
import { hashPassword } from "../src/auth/passwords.js";
// Load the shared in-memory MongoDB lifecycle (beforeAll/afterAll).
import { clearDb } from "./helpers/db.js";

const app = createApp({ clientOrigin: config.CLIENT_ORIGIN });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// supertest returns the set-cookie header as string | string[] depending on
// whether there is one or many cookies.  Normalise to always an array.
function extractSetCookie(headers: Record<string, unknown>): string[] {
  const raw = headers["set-cookie"];
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") return [raw];
  return [];
}

async function registerUser(
  email = "test@example.com",
  password = "password123",
): Promise<{ accessToken: string; cookie: string }> {
  const res = await request(app)
    .post("/api/auth/register")
    .set("x-skip-rate-limit", "true")
    .send({ email, password });

  expect(res.status).toBe(201);
  const cookies = extractSetCookie(res.headers);
  const cookie = cookies.find((c) => c.startsWith("refreshToken=")) ?? "";
  return { accessToken: res.body.accessToken as string, cookie };
}

async function loginUser(
  email = "test@example.com",
  password = "password123",
): Promise<{ accessToken: string; cookie: string }> {
  const res = await request(app)
    .post("/api/auth/login")
    .set("x-skip-rate-limit", "true")
    .send({ email, password });

  expect(res.status).toBe(200);
  const cookies = extractSetCookie(res.headers);
  const cookie = cookies.find((c) => c.startsWith("refreshToken=")) ?? "";
  return { accessToken: res.body.accessToken as string, cookie };
}

// ---------------------------------------------------------------------------
// Clear data between tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await clearDb();
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
  it("creates a user and returns an access token + cookie", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "alice@example.com", password: "supersecret1" });

    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.user.email).toBe("alice@example.com");

    const cookies = extractSetCookie(res.headers);
    expect(cookies.some((c) => c.startsWith("refreshToken="))).toBe(true);
    expect(cookies.some((c) => c.includes("HttpOnly"))).toBe(true);
    expect(cookies.some((c) => c.includes("Path=/api/auth"))).toBe(true);
    expect(cookies.some((c) => c.includes("SameSite=Lax"))).toBe(true);
  });

  it("normalises the email to lowercase", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "ALICE@EXAMPLE.COM", password: "supersecret1" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("alice@example.com");
  });

  it("returns 409 when the email is already registered", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "dup@example.com", password: "password123" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "dup@example.com", password: "password123" });

    expect(res.status).toBe(409);
  });

  it("returns 400 for an invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "password123" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a password shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "alice@example.com", password: "short" });

    expect(res.status).toBe(400);
  });

  it("rejects unknown body keys", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "alice@example.com", password: "password123", role: "admin" });

    expect(res.status).toBe(400);
  });

  it("enforces the 72-byte password limit on multi-byte characters", async () => {
    // 19 emojis (🔒 = 4 bytes each = 76 bytes total, but only 38 characters length)
    const longBytePassword = "🔒".repeat(19);
    expect(longBytePassword.length).toBeLessThanOrEqual(72);
    expect(Buffer.byteLength(longBytePassword, "utf8")).toBeGreaterThan(72);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "multibyte@example.com", password: longBytePassword });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.password[0]).toMatch(/72 bytes/i);

    // Valid multi-byte password: 15 emojis = 60 bytes <= 72
    const validBytePassword = "🔒".repeat(15);
    const validRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "multibyte-valid@example.com", password: validBytePassword });

    expect(validRes.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    const passwordHash = await hashPassword("correct-password");
    await User.create({ email: "user@example.com", passwordHash });
  });

  it("returns an access token and refresh cookie on correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
    const cookies = extractSetCookie(res.headers);
    expect(cookies.some((c) => c.startsWith("refreshToken="))).toBe(true);
  });

  it("returns 401 for a wrong password — with a generic message", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    // The message must not say "wrong password" or "incorrect password" —
    // only the generic form that doesn't leak whether the email exists.
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("returns 401 for an unknown email — same generic message", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("is case-insensitive for email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "USER@EXAMPLE.COM", password: "correct-password" });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

describe("POST /api/auth/refresh", () => {
  it("issues a new access token and rotates the refresh cookie", async () => {
    const { cookie } = await registerUser();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
    // A new Set-Cookie should be present (the rotated token).
    const cookies = extractSetCookie(res.headers);
    expect(cookies.some((c) => c.startsWith("refreshToken="))).toBe(true);
  });

  it("the old refresh token cannot be reused after rotation and revokes the whole family", async () => {
    const { cookie: tokenA } = await registerUser("family@example.com");

    // First refresh — rotates from tokenA to tokenB
    const rotateRes = await request(app)
      .post("/api/auth/refresh")
      .set("x-skip-rate-limit", "true")
      .set("Cookie", tokenA);

    expect(rotateRes.status).toBe(200);
    const cookies = extractSetCookie(rotateRes.headers);
    const tokenB = cookies.find((c) => c.startsWith("refreshToken=")) ?? "";
    expect(tokenB).toBeTruthy();

    // Replay the original (now rotated-out) tokenA -> triggers reuse detection!
    const reuseRes = await request(app)
      .post("/api/auth/refresh")
      .set("x-skip-rate-limit", "true")
      .set("Cookie", tokenA);

    expect(reuseRes.status).toBe(401);

    // Because tokenA was reused, the entire token family was revoked.
    // Thus, even the legitimate active tokenB must now be rejected!
    const tokenBRes = await request(app)
      .post("/api/auth/refresh")
      .set("x-skip-rate-limit", "true")
      .set("Cookie", tokenB);

    expect(tokenBRes.status).toBe(401);

    // Verify all tokens in the database for this family are deleted
    const count = await RefreshToken.countDocuments();
    expect(count).toBe(0);
  });

  it("rejects a bad Origin header with 403 Forbidden", async () => {
    const { cookie } = await registerUser();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("x-skip-rate-limit", "true")
      .set("Origin", "https://malicious-attacker.com")
      .set("Cookie", cookie);

    expect(res.status).toBe(403);
  });

  it("returns 401 when no cookie is present", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("x-skip-rate-limit", "true");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a garbage cookie value", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("x-skip-rate-limit", "true")
      .set("Cookie", "refreshToken=garbage");

    expect(res.status).toBe(401);
  });

  it("handles the parallel refresh race by ensuring exactly one succeeds", async () => {
    const { cookie } = await registerUser("race@example.com");

    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/auth/refresh")
        .set("x-skip-rate-limit", "true")
        .set("Cookie", cookie),
      request(app)
        .post("/api/auth/refresh")
        .set("x-skip-rate-limit", "true")
        .set("Cookie", cookie),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 401]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  it("revokes the refresh token so a subsequent /refresh fails", async () => {
    const { cookie } = await registerUser();

    await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie);

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);

    expect(res.status).toBe(401);
  });

  it("succeeds even with no cookie", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("x-skip-rate-limit", "true");
    // 204 No Content — idempotent
    expect(res.status).toBe(204);
  });

  it("rejects a bad Origin header with 403 Forbidden", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("x-skip-rate-limit", "true")
      .set("Origin", "https://malicious-attacker.com");

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout-all
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout-all", () => {
  it("revokes all refresh tokens for the user", async () => {
    // Log in twice to create two refresh tokens for the same account.
    const { accessToken } = await registerUser();
    const { cookie: cookie2 } = await loginUser();

    await request(app)
      .post("/api/auth/logout-all")
      .set("Authorization", `Bearer ${accessToken}`);

    // Neither token should work now.
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie2);

    expect(res.status).toBe(401);

    const count = await RefreshToken.countDocuments();
    expect(count).toBe(0);
  });

  it("returns 401 without an access token", async () => {
    const res = await request(app).post("/api/auth/logout-all");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

describe("GET /api/auth/me", () => {
  it("returns the current user when authenticated", async () => {
    const { accessToken } = await registerUser("me@example.com");

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("me@example.com");
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 with an expired or invalid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not.a.valid.jwt");

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe("Rate limiting", () => {
  it("returns 429 after exceeding the rate limit", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .set("x-test-rate-limit", "true")
        .send({ email: `rate${i}@example.com`, password: "password123" });
      expect(res.status).not.toBe(429);
    }

    const res = await request(app)
      .post("/api/auth/login")
      .set("x-test-rate-limit", "true")
      .send({ email: "rate_exceeded@example.com", password: "password123" });

    expect(res.status).toBe(429);
    expect(res.body.error.message).toMatch(/too many requests/i);
  });
});
