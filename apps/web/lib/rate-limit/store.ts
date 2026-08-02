import "server-only";
import { RedisStore, type RateLimitStore } from "@ruleshop/rate-limit";
import { getRedis } from "@/lib/redis/client";

/** Redis when configured; otherwise none, and the limiter uses process memory. */
export function getRateLimitStore(): RateLimitStore | null {
  const redis = getRedis();
  return redis ? new RedisStore(redis) : null;
}
