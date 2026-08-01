/**
 * @ruleshop/rate-limit — limitare de rată cu GCRA.
 *
 * Punct unic de import. Algoritmul (`gcra`) este pur și testabil separat;
 * magazinele (memorie / Redis) doar îi păstrează starea.
 */

export { gcra, gcraParams, ttlMs } from "./gcra";
export type { GcraOutcome, GcraParams } from "./gcra";

export { MemoryStore } from "./memory-store";
export { RedisStore } from "./redis-store";
export type { RedisLike } from "./redis-store";

export { RateLimiter, rateLimitHeaders } from "./limiter";
export type { RateLimiterOptions } from "./limiter";

export type { RateLimitPolicy, RateLimitResult, RateLimitStore } from "./types";
