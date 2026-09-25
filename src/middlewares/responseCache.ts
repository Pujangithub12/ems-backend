import { NextFunction, Response } from "express";
import { AuthRequest } from "./auth";
import { cacheGetRaw, cacheSetRaw } from "../utils/cache";
import { RESPONSE_CACHE_PREFIX } from "../utils/cacheInvalidation";

/**
 * Caches a GET route's successful JSON response in Redis. Mount it AFTER
 * authMiddleware (and any role/permission middleware) so unauthenticated or
 * forbidden requests never reach the cache.
 *
 * `group` must match an entry in CACHE_GROUPS (utils/cacheInvalidation.ts) —
 * that's what clears these entries when the underlying data changes.
 *
 * Keys always include the organization. `perUser: true` (default) also
 * includes the caller's id and role, for endpoints whose result depends on who
 * is asking (e.g. a member only sees their own projects); pass `false` only
 * when the controller returns the same thing for every member of the org.
 *
 * Adds an `X-Cache: HIT | MISS` header so caching is easy to verify.
 */
export const cacheResponse =
  (group: string, ttlSeconds: number, opts: { perUser?: boolean } = {}) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.method !== "GET" || !req.organization || !req.user) return next();

    const scope = opts.perUser === false ? "shared" : `u${req.user.id}-${req.user.role}`;
    const key = `${RESPONSE_CACHE_PREFIX}${group}:${req.organization.id}:${scope}:${req.originalUrl}`;

    const hit = await cacheGetRaw(key);
    if (hit !== null) {
      res.setHeader("X-Cache", "HIT");
      return res.status(200).type("json").send(hit);
    }

    res.setHeader("X-Cache", "MISS");
    res.json = (body: unknown) => {
      const raw = JSON.stringify(body);
      if (res.statusCode === 200 && raw !== undefined) void cacheSetRaw(key, raw, ttlSeconds);
      return res.type("json").send(raw);
    };
    next();
  };
