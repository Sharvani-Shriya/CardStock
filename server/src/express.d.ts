// Extend Express's Request type so that req.user is typed throughout the
// codebase, not cast to `any`.  This file is included by tsconfig.json via
// the "include": ["src"] entry; no import is needed.
import type { AuthUser } from "./types.js";

declare global {
  namespace Express {
    interface Request {
      // Set by the requireAuth middleware after it validates the Bearer token.
      // Routes that sit behind requireAuth can trust that this is populated.
      user?: AuthUser;
    }
  }
}
