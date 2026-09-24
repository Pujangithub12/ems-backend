import { prisma } from "../config/prisma";
import { cacheDel, cacheDelPrefix, cacheGet, cacheSet } from "./cache";

/** Short TTL: the backstop if an invalidation is ever missed. Password
 * changes/role changes are also cleared explicitly (see config/prisma.ts). */
const AUTH_TTL_SECONDS = 60;
const PREFIX = "auth:user:";

const loadUser = (id: number) =>
  prisma.user.findUnique({
    where: { id },
    // The hash is never needed after login and shouldn't sit in a cache.
    omit: { password: true },
    include: { memberships: { include: { organization: true } } },
  });

export type AuthUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

/** The user + memberships + organizations that authMiddleware needs on every
 * request — served from Redis when possible, otherwise from the DB (and cached). */
export async function getAuthUser(id: number): Promise<AuthUser | null> {
  const key = `${PREFIX}${id}`;
  const cached = await cacheGet<AuthUser>(key);
  if (cached) return cached;

  const user = await loadUser(id);
  if (user) await cacheSet(key, user, AUTH_TTL_SECONDS);
  return user;
}

export const invalidateAuthUser = (id: number) => cacheDel(`${PREFIX}${id}`);
export const invalidateAllAuthUsers = () => cacheDelPrefix(PREFIX);
