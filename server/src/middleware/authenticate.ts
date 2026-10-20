import type { RequestHandler } from "express";
import { verifyAccessToken } from "../auth/tokens.js";
import { HttpError } from "../errors.js";

// Validates the Bearer token in the Authorization header and attaches the
// decoded user to req.user.  Routes that depend on this middleware can
// safely assume req.user is set; TypeScript narrows via the non-null assertion
// in each route handler.
//
// We return 401 (Unauthorized) for every token problem — expired, malformed,
// wrong signature — without distinguishing between them.  A more specific
// message would help an attacker diagnose which step they got wrong.
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    return next(new HttpError(401, "Authentication required"));
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    // jwt.verify() throws on expiry or bad signature; both are 401.
    next(new HttpError(401, "Invalid or expired token"));
  }
};
