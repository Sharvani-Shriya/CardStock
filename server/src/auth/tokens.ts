import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

// Access tokens expire quickly so a stolen token has a short window of use.
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

// Refresh tokens live long enough to cover typical usage patterns (a week of
// not closing the browser tab) without requiring frequent re-logins.
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AccessTokenPayload {
  sub: string;   // MongoDB userId as a string
  email: string;
}

// Signs a short-lived JWT access token.  Only the userId and email are baked
// in; anything else (roles, permissions) belongs in a future token version.
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

// Verifies a JWT and returns its payload, or throws if the token is invalid or
// expired.  Callers should catch the error and return 401.
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET);
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof decoded["sub"] !== "string" ||
    typeof decoded["email"] !== "string"
  ) {
    throw new Error("Malformed token payload");
  }
  return { sub: decoded["sub"], email: decoded["email"] };
}

// Generates a cryptographically random 48-byte refresh token and returns:
//   - rawToken: the string to send to the client (stored only in the cookie)
//   - tokenHash: SHA-256 of rawToken, stored in the database
//
// Hashing before storage means a MongoDB breach does not give the attacker
// valid refresh tokens.
export function generateRefreshToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(48).toString("hex");
  const tokenHash = sha256(rawToken);
  return { rawToken, tokenHash };
}

// Hashes a raw refresh token the same way generateRefreshToken() does, so the
// route handler can look up a presented token without storing the raw value.
export function hashRefreshToken(rawToken: string): string {
  return sha256(rawToken);
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
