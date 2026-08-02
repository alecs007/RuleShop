import { gcra, ttlMs } from "./gcra";
import type { RateLimitStore } from "./types";

/**
 * Process-memory state: the only store when there is no Redis, and the safety
 * net when Redis falls over. Limits per instance only, so with N processes the
 * effective limit is N times the configured one.
 */
export class MemoryStore implements RateLimitStore {
  readonly name = "memory" as const;

  private readonly entries = new Map<string, { tatMs: number; expiresAtMs: number }>();

  private static readonly SWEEP_EVERY = 512;
  private writesSinceSweep = 0;

  async consume(
    key: string,
    nowMs: number,
    emissionIntervalMs: number,
    toleranceMs: number,
    cost: number,
  ) {
    const entry = this.entries.get(key);
    const stored = entry && entry.expiresAtMs > nowMs ? entry.tatMs : null;

    const outcome = gcra(stored, nowMs, { emissionIntervalMs, toleranceMs }, cost);

    this.entries.set(key, {
      tatMs: outcome.tatMs,
      expiresAtMs: nowMs + ttlMs(outcome.tatMs, nowMs),
    });
    this.maybeSweep(nowMs);

    return {
      allowed: outcome.allowed,
      remaining: outcome.remaining,
      retryAfterMs: outcome.retryAfterMs,
      resetAfterMs: outcome.resetAfterMs,
    };
  }

  async reset(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /** Without this the map grows with every key ever seen. */
  private maybeSweep(nowMs: number): void {
    if (++this.writesSinceSweep < MemoryStore.SWEEP_EVERY) return;
    this.writesSinceSweep = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAtMs <= nowMs) this.entries.delete(key);
    }
  }
}
