import type { CookieOptions, Response } from "express";
import { config } from "../config.js";
import { REFRESH_TOKEN_TTL_MS } from "./tokens.js";

// The cookie name is a constant so a typo in one place doesn't silently
// break the other.
export const REFRESH_COOKIE_NAME = "refreshToken";

// Cookie options shared between set and clear operations.  They match the
// design decisions documented in the auth plan:
//
//   HttpOnly  — JavaScript cannot read the cookie, so XSS cannot steal it.
//   Secure    — only sent over HTTPS (controlled by COOKIE_SECURE env flag).
//   SameSite=Lax — sent on same-site navigations but not on cross-site
//                  sub-resource requests, blocking CSRF while allowing normal
//                  browser navigation.
//   Path=/api/auth — the browser only sends the cookie to the auth endpoints,
//                    not to every API request, minimising the attack surface.
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    path: "/api/auth",
  };
}

export function setRefreshCookie(res: Response, rawToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    ...cookieOptions(),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearRefreshCookie(res: Response): void {
  // maxAge: 0 tells the browser to delete the cookie immediately.
  res.cookie(REFRESH_COOKIE_NAME, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
}
