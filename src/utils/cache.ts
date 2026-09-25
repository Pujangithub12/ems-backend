import { redis, isRedisReady } from "../config/redis";

/** Prisma rows hold Dates, which JSON turns into ISO strings — revive them so
 * a cached value has the same shape as a fresh query result. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const reviveDates = (_key: string, value: unknown) =>
  typeof value === "string" && ISO_DATE.test(value) ? new Date(value) : value;

/** Every helper swallows Redis errors: the cache must never be able to fail a request. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis || !isRedisReady()) return null;
  try {
    const raw = await redis.get(key);
    return raw == null ? null : (JSON.parse(raw, reviveDates) as T);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redis || !isRedisReady()) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* best effort */
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (!redis || !isRedisReady() || keys.length === 0) return;
  try {
    await redis.unlink(...keys);
  } catch {
    /* best effort */
  }
}

/** Deletes every key starting with `prefix` (SCAN, not KEYS, so it never blocks Redis). */
export async function cacheDelPrefix(prefix: string): Promise<void> {
  if (!redis || !isRedisReady()) return;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) await redis.unlink(...keys);
    } while (cursor !== "0");
  } catch {
    /* best effort */
  }
}

/** Read-through helper: returns the cached value, or runs `loader` and caches its result. */
export async function getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await loader();
  if (fresh !== null && fresh !== undefined) await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}

/** Raw-string variants for cached HTTP response bodies: stored and replayed
 * byte-for-byte, so (unlike cacheGet) nothing is parsed or date-revived. */
export async function cacheGetRaw(key: string): Promise<string | null> {
  if (!redis || !isRedisReady()) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function cacheSetRaw(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (!redis || !isRedisReady()) return;
  try {
    await redis.set(key, value, "EX", ttlSeconds);
  } catch {
    /* best effort */
  }
}
