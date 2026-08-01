import { gcra, ttlMs } from "./gcra";
import type { RateLimitStore } from "./types";

/**
 * Stare în memoria procesului.
 *
 * Două roluri: singurul magazin când nu există Redis (dezvoltare, teste) și
 * plasa de siguranță când Redis cade. Limitează doar per instanță — cu mai
 * multe procese, limita efectivă se înmulțește cu numărul lor. E o degradare
 * asumată, dar tot e mult mai bine decât să nu limitezi deloc.
 *
 * Atomicitatea vine gratis: Node rulează un singur fir, iar `consume` nu are
 * niciun `await` între citire și scriere.
 */
export class MemoryStore implements RateLimitStore {
  readonly name = "memory" as const;

  private readonly entries = new Map<string, { tatMs: number; expiresAtMs: number }>();

  /** Sub acest prag nu merită să scanăm harta după chei expirate. */
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

  /** Fără asta, harta ar crește cu fiecare cheie văzută vreodată. */
  private maybeSweep(nowMs: number): void {
    if (++this.writesSinceSweep < MemoryStore.SWEEP_EVERY) return;
    this.writesSinceSweep = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAtMs <= nowMs) this.entries.delete(key);
    }
  }
}
