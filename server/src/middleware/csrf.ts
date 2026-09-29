import { doubleCsrf } from "csrf-csrf";
import { config } from "../config.js";

export const { invalidCsrfTokenError, generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.csrfSecret,
  // Bind the CSRF token to the session JWT so a leaked token is only valid for
  // that specific session, not all sessions sharing the same CSRF secret.
  getSessionIdentifier: (req) => (req as any).cookies?.sw_session ?? "",
  cookieName: "sw_csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    secure: process.env.NODE_ENV !== "development",
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
});
