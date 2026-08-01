import "server-only";
import { RedisStore, type RateLimitStore } from "@ruleshop/rate-limit";
import { getRedis } from "@/lib/redis/client";

/**
 * Magazinul de stare pentru limitare: Redis dacă e configurat, altfel niciunul
 * — caz în care limitatorul se descurcă singur, din memoria procesului.
 */
export function getRateLimitStore(): RateLimitStore | null {
  const redis = getRedis();
  return redis ? new RedisStore(redis) : null;
}
