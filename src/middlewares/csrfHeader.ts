import { Request, Response, NextFunction } from "express";

/**
 * Auth here is cookie-based, and the cookie is SameSite=None in production
 * (required since the frontend and API are hosted cross-site) — which
 * defeats SameSite's normal CSRF protection. Most mutating routes are still
 * safe: their JSON bodies mean the browser sends a CORS preflight first
 * (application/json isn't a CORS-"simple" content type), and index.ts's
 * origin whitelist blocks anything not from this app before the real
 * request is ever sent.
 *
 * multipart/form-data (every file-upload route) IS a "simple" request under
 * the Fetch/CORS spec, so it skips preflight entirely — a malicious page
 * could submit one of these as a plain cross-site form post and it would
 * execute with a logged-in victim's cookies attached, even though CORS
 * still stops the attacker's own JS from reading the response.
 *
 * Requiring this header closes that gap: adding any non-simple header
 * forces a preflight, and that preflight is gated by the same origin
 * whitelist — so a disallowed origin's request never gets sent at all, not
 * just its response hidden. The frontend's shared axios instance
 * (frontend/src/api/axios.ts) sets this by default on every request.
 */
export const requireCsrfHeader = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers["x-requested-with"] !== "XMLHttpRequest") {
    return res.status(403).json({ message: "Missing required request header." });
  }
  next();
};
