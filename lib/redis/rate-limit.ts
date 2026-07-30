import "server-only";
import { getRedis } from "./client";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Secunde până la resetarea ferestrei. */
  resetSeconds: number;
}

/**
 * Limitare de rată cu fereastră fixă (INCR + EXPIRE).
 *
 * Fail-open deliberat: dacă Redis lipsește sau e căzut, cererea trece. Altfel un
 * Redis oprit ar bloca încărcarea de imagini în magazin — protecția nu trebuie
 * să devină ea însăși cauza indisponibilității. Autorizarea si validarea
 * fișierelor rămân oricum în fața acestui strat.
 */
export async function rateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, remaining: input.limit, resetSeconds: 0 };
  }

  try {
    const namespaced = `ratelimit:${input.key}`;
    const count = await redis.incr(namespaced);
    if (count === 1) {
      await redis.expire(namespaced, input.windowSeconds);
    }
    const ttl = await redis.ttl(namespaced);
    return {
      allowed: count <= input.limit,
      remaining: Math.max(0, input.limit - count),
      resetSeconds: ttl > 0 ? ttl : input.windowSeconds,
    };
  } catch (error) {
    console.warn("[rate-limit] Redis indisponibil, cererea trece:", error);
    return { allowed: true, remaining: input.limit, resetSeconds: 0 };
  }
}
