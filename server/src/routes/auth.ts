import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Request } from "express";
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from "../auth/cookie.js";
import {
  consumeTimingBudget,
  hashPassword,
  verifyPassword,
} from "../auth/passwords.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
} from "../auth/tokens.js";
import { config } from "../config.js";
import { HttpError } from "../errors.js";
import { parseWith } from "../http.js";
import { requireAuth } from "../middleware/authenticate.js";
import { RefreshToken } from "../models/RefreshToken.js";
import { User } from "../models/User.js";
import { issueWsTicket } from "../realtime.js";
import { loginBody, registerBody, wsTicketBody } from "../schemas.js";
import rateLimit from "express-rate-limit";

export const authRouter = Router();

// Rate limiting: 10 requests per 15 minutes per IP.
// In test mode, only runs when x-test-rate-limit is "true" to prevent exhausting limit in general tests.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: { error: { message: "Too many requests, please try again later." } },
  skip: (req) => process.env.NODE_ENV === "test" && req.headers["x-test-rate-limit"] !== "true",
});

// ---------------------------------------------------------------------------
// Origin guard helper
// ---------------------------------------------------------------------------
// POST /api/auth/refresh and POST /api/auth/logout carry only the HttpOnly
// cookie (no Authorization header), so a CSRF attacker could trigger them from
// a cross-origin page.  Checking the Origin header stops that: a browser
// always sends Origin on cross-site requests.  curl and server-to-server calls
// (no Origin) are allowed through — the cookie path already limits exposure.
function assertSameOrigin(req: Request): void {
  const origin = req.headers["origin"];
  if (origin === undefined) {
    // No Origin header means the request came from a server (curl, fetch from
    // Node, etc.), not from a browser's cross-site load.  Allow it.
    return;
  }

  const allowed = config.CLIENT_ORIGIN.split(",").map((o) => o.trim());
  if (!allowed.includes(origin)) {
    throw new HttpError(403, "Forbidden");
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
authRouter.post("/register", authLimiter, async (req, res) => {
  const body = parseWith(registerBody, req.body);

  // Normalise email the same way the User model does (lowercase) so the
  // uniqueness check is consistent.
  const email = body.email.toLowerCase().trim();

  const existing = await User.exists({ email });
  if (existing) {
    // 409 Conflict: the resource (email address) already exists.
    throw new HttpError(409, "Email is already registered");
  }

  const passwordHash = await hashPassword(body.password);
  const user = await User.create({ email, passwordHash });

  const userId = (user._id as { toString(): string }).toString();
  const accessToken = signAccessToken({ sub: userId, email });

  const familyId = randomUUID();
  const { rawToken, tokenHash } = generateRefreshToken();
  await RefreshToken.create({
    tokenHash,
    userId: user._id,
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  setRefreshCookie(res, rawToken);
  res.status(201).json({ accessToken, user: { id: userId, email } });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
authRouter.post("/login", authLimiter, async (req, res) => {
  const body = parseWith(loginBody, req.body);
  const email = body.email.toLowerCase().trim();

  const user = await User.findOne({ email });

  if (!user) {
    // Run the full bcrypt comparison against the dummy hash so the response
    // time is the same whether the email exists or not.  A fast "not found"
    // path would let an attacker enumerate registered emails via timing.
    await consumeTimingBudget();
    throw new HttpError(401, "Invalid email or password");
  }

  const passwordHash = user.passwordHash as string;
  const valid = await verifyPassword(body.password, passwordHash);
  if (!valid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const userId = (user._id as { toString(): string }).toString();
  const accessToken = signAccessToken({ sub: userId, email });

  const familyId = randomUUID();
  const { rawToken, tokenHash } = generateRefreshToken();
  await RefreshToken.create({
    tokenHash,
    userId: user._id,
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  setRefreshCookie(res, rawToken);
  res.json({ accessToken, user: { id: userId, email } });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh  — restore the session on page load
// ---------------------------------------------------------------------------
// The client sends no Authorization header here; authentication is entirely
// via the HttpOnly cookie.  On success it issues a new access token AND rotates
// the refresh token (old one is revoked, new one is set in the cookie).
authRouter.post("/refresh", authLimiter, async (req, res) => {
  assertSameOrigin(req);

  const rawToken = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
  if (!rawToken) {
    throw new HttpError(401, "No refresh token");
  }

  const tokenHash = hashRefreshToken(rawToken);
  const stored = await RefreshToken.findOne({ tokenHash });

  if (!stored) {
    // The token is not in the database: either it was already revoked or it never existed.
    clearRefreshCookie(res);
    throw new HttpError(401, "Invalid or expired refresh token");
  }

  if (stored.isUsed) {
    // REUSE ATTACK DETECTED: A rotated-out refresh token was presented again!
    // Revoke the entire family immediately to protect against token theft.
    await RefreshToken.deleteMany({ familyId: stored.familyId });
    clearRefreshCookie(res);
    throw new HttpError(401, "Invalid or expired refresh token");
  }

  if (stored.expiresAt < new Date()) {
    await stored.deleteOne();
    clearRefreshCookie(res);
    throw new HttpError(401, "Refresh token expired");
  }

  // Mark the current token as used so any replay will trigger family revocation.
  stored.isUsed = true;
  await stored.save();

  const { familyId } = stored;
  const userId = (stored.userId as { toString(): string }).toString();

  const { rawToken: newRaw, tokenHash: newHash } = generateRefreshToken();
  await RefreshToken.create({
    tokenHash: newHash,
    userId: stored.userId,
    familyId,  // keep the same family so revoke-all is still possible
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    isUsed: false,
  });

  // Re-fetch the user to get the current email (it could have changed).
  const user = await User.findById(stored.userId).select("email").lean();
  if (!user) {
    // The account was deleted between the token being issued and now.
    clearRefreshCookie(res);
    throw new HttpError(401, "Account not found");
  }

  const email = user.email as string;
  const accessToken = signAccessToken({ sub: userId, email });

  setRefreshCookie(res, newRaw);
  res.json({ accessToken, user: { id: userId, email } });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout  — revoke the current refresh token
// ---------------------------------------------------------------------------
authRouter.post("/logout", async (req, res) => {
  assertSameOrigin(req);

  const rawToken = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
  if (rawToken) {
    const tokenHash = hashRefreshToken(rawToken);
    await RefreshToken.deleteOne({ tokenHash });
  }

  clearRefreshCookie(res);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout-all  — revoke every refresh token for this user
// ---------------------------------------------------------------------------
// Requires a valid access token so an attacker with only the refresh cookie
// cannot silently log out all the user's sessions.
authRouter.post("/logout-all", requireAuth, async (req, res) => {
  assertSameOrigin(req);

  // requireAuth guarantees req.user is populated.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;

  await RefreshToken.deleteMany({ userId });

  clearRefreshCookie(res);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// GET /api/auth/me  — who am I? (requires a valid access token)
// ---------------------------------------------------------------------------
authRouter.get("/me", requireAuth, (req, res) => {
  // requireAuth already validated the token and populated req.user.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  res.json({ user: req.user! });
});

// ---------------------------------------------------------------------------
// POST /api/auth/ws-ticket — acquire single-use WebSocket ticket for a board
// ---------------------------------------------------------------------------
authRouter.post("/ws-ticket", requireAuth, (req, res) => {
  const body = parseWith(wsTicketBody, req.body);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ticket = issueWsTicket(req.user!.id, body.boardId);
  res.json({ ticket });
});
