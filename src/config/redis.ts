import Redis from "ioredis";

/**
 * Optional Redis connection, used purely as a cache. Everything that touches
 * it (see utils/cache.ts) treats Redis as best-effort: when REDIS_URL is unset,
 * or Redis is down/slow, callers fall straight through to the database — the
 * app behaves exactly as it did before Redis existed, just slower.
 *
 * Works with both the internal (`redis://`) and external (`rediss://`, TLS)
 * URLs Render's Key Value service hands out.
 */
const url = process.env.REDIS_URL;

let lastErrorLogAt = 0;

export const redis: Redis | null = url
  ? new Redis(url, {
      // Fail fast instead of queueing/retrying commands while disconnected, so
      // an outage costs a request one quick DB fallback, not a hang.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 500,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
    })
  : null;

redis?.on("error", (err) => {
  // ioredis emits this on every failed reconnect attempt — throttle the log.
  const now = Date.now();
  if (now - lastErrorLogAt > 30_000) {
    lastErrorLogAt = now;
    console.error("Redis error (falling back to database):", err.message);
  }
});

redis?.on("ready", () => console.log("Redis cache connected"));

export const isRedisReady = (): boolean => redis?.status === "ready";
