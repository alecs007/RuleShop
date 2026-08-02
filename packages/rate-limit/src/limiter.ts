import { gcraParams } from "./gcra";
import { MemoryStore } from "./memory-store";
import type { RateLimitPolicy, RateLimitResult, RateLimitStore } from "./types";

export interface RateLimiterOptions {
  /** The primary store. Omitted means process memory only. */
  store?: RateLimitStore | null;
  prefix?: string;
  onStoreError?: (error: unknown) => void;
}

/**
 * Holds a primary store (Redis) and a process-memory fallback, so that when
 * the primary fails the protection weakens instead of disappearing.
 */
export class RateLimiter {
  private readonly store: RateLimitStore | null;
  private readonly fallback = new MemoryStore();
  private readonly prefix: string;
  private readonly onStoreError?: (error: unknown) => void;

  constructor(options: RateLimiterOptions = {}) {
    this.store = options.store ?? null;
    this.prefix = options.prefix ?? "rl";
    this.onStoreError = options.onStoreError;
  }

  /** `cost` lets an expensive operation (e.g. an AI call) draw more budget. */
  async consume(
    key: string,
    policy: RateLimitPolicy,
    cost = 1,
  ): Promise<RateLimitResult> {
    const { emissionIntervalMs, toleranceMs } = gcraParams(
      policy.limit,
      policy.windowSeconds * 1000,
      policy.burst ?? policy.limit,
    );
    const namespaced = `${this.prefix}:${key}`;
    const now = Date.now();

    if (this.store) {
      try {
        const outcome = await this.store.consume(
          namespaced,
          now,
          emissionIntervalMs,
          toleranceMs,
          cost,
        );
        return this.toResult(outcome, policy.limit, this.store.name);
      } catch (error) {
        this.onStoreError?.(error);

        const onError = policy.onStoreError ?? "fallback";
        if (onError === "allow") {
          return {
            allowed: true,
            limit: policy.limit,
            remaining: policy.limit,
            retryAfterSeconds: 0,
            resetSeconds: 0,
            source: "store-error",
          };
        }
        if (onError === "deny") {
          return {
            allowed: false,
            limit: policy.limit,
            remaining: 0,
            retryAfterSeconds: policy.windowSeconds,
            resetSeconds: policy.windowSeconds,
            source: "store-error",
          };
        }
        // `fallback` — falls through to memory below.
      }
    }

    const outcome = await this.fallback.consume(
      namespaced,
      now,
      emissionIntervalMs,
      toleranceMs,
      cost,
    );
    return this.toResult(outcome, policy.limit, "memory");
  }

  /**
   * Clears a key's budget, so failed attempts before a successful sign-in do
   * not carry over into the next session.
   */
  async reset(key: string): Promise<void> {
    const namespaced = `${this.prefix}:${key}`;
    await Promise.allSettled([
      this.store?.reset(namespaced),
      this.fallback.reset(namespaced),
    ]);
  }

  private toResult(
    outcome: {
      allowed: boolean;
      remaining: number;
      retryAfterMs: number;
      resetAfterMs: number;
    },
    limit: number,
    source: "redis" | "memory",
  ): RateLimitResult {
    return {
      allowed: outcome.allowed,
      limit,
      remaining: outcome.remaining,
      retryAfterSeconds: Math.ceil(outcome.retryAfterMs / 1000),
      resetSeconds: Math.ceil(outcome.resetAfterMs / 1000),
      source,
    };
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetSeconds),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(Math.max(1, result.retryAfterSeconds));
  }
  return headers;
}
