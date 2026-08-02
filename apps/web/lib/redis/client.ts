import "server-only";
import Redis from "ioredis";

/**
 * One client per process, kept on `globalThis` across hot reloads. Returns
 * null without `REDIS_URL`: Redis is protection, not a hard dependency.
 */
const globalForRedis = globalThis as unknown as { redis?: Redis | null };

export function getRedis(): Redis | null {
  if (globalForRedis.redis !== undefined) return globalForRedis.redis;

  const url = process.env.REDIS_URL;
  if (!url) {
    globalForRedis.redis = null;
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    // Without this, a stopped Redis floods the console with retries.
    retryStrategy: (times) => (times > 3 ? null : 200),
  });
  client.on("error", (error) => {
    console.warn("[redis] eroare de conexiune:", error.message);
  });

  globalForRedis.redis = client;
  return client;
}
