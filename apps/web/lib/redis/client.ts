import "server-only";
import Redis from "ioredis";

/**
 * Clientul Redis, creat o singură dată per proces (în dev, `globalThis` îl
 * păstrează peste hot reload). Întoarce null când `REDIS_URL` lipsește: Redis
 * este optimizare si protecție, nu o dependință fără care aplicația cade.
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
    // Fără asta, un Redis oprit ar umple consola cu reîncercări.
    retryStrategy: (times) => (times > 3 ? null : 200),
  });
  client.on("error", (error) => {
    console.warn("[redis] eroare de conexiune:", error.message);
  });

  globalForRedis.redis = client;
  return client;
}
