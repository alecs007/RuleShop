export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
  /** How far traffic may bunch up. Defaults to `limit`; `1` forces an even pace. */
  burst?: number;
  /**
   * What happens when the store is unreachable: `fallback` (default) limits
   * from process memory, `allow` lets the request through, `deny` rejects it.
   */
  onStoreError?: "fallback" | "allow" | "deny";
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetSeconds: number;
  /** What actually decided — useful when diagnosing a Redis outage. */
  source: "redis" | "memory" | "store-error";
}

export interface RateLimitStore {
  readonly name: "redis" | "memory";
  /**
   * Must be atomic, or two concurrent requests read the same `tat` and both
   * pass.
   */
  consume(
    key: string,
    nowMs: number,
    emissionIntervalMs: number,
    toleranceMs: number,
    cost: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number; resetAfterMs: number }>;
  reset(key: string): Promise<void>;
}
