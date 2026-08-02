import "server-only";
import { RateLimiter, type RateLimitPolicy } from "@ruleshop/rate-limit";
import { getRateLimitStore } from "./store";

export { rateLimitHeaders } from "@ruleshop/rate-limit";
export type { RateLimitResult } from "@ruleshop/rate-limit";

/**
 * Every rate-limit policy in one place, so "what is limited, and how much" is
 * answerable at a glance. Each also states what happens if Redis falls over,
 * because the answer is not the same everywhere.
 */
export const POLICIES = {
  /**
   * Anti brute-force. `burst: 3` allows a few consecutive typos and then
   * forces a slow pace; `deny` on a Redis outage, because an unavailable
   * state store is no reason to open up authentication.
   */
  login: { limit: 10, windowSeconds: 600, burst: 3, onStoreError: "deny" },

  /** The order code is 6 digits: without a cap it could be guessed. */
  orderChallenge: { limit: 5, windowSeconds: 900, burst: 2, onStoreError: "deny" },

  /** Rapid repeat submissions are either a UI bug or abuse. */
  checkout: { limit: 5, windowSeconds: 60, burst: 2 },

  /** Image uploads from the control plane. */
  uploads: { limit: 60, windowSeconds: 60 },

  /** Gemini quotas: a button held down must not burn through them. */
  aiAnalyze: { limit: 10, windowSeconds: 3600, burst: 3 },
  aiGenerate: { limit: 20, windowSeconds: 3600, burst: 5 },
  aiClassify: { limit: 30, windowSeconds: 3600, burst: 5 },

  /** Hygiene, not security: with no Redis, better to write history than lose it. */
  evaluationLog: { limit: 120, windowSeconds: 60, onStoreError: "allow" },
} as const satisfies Record<string, RateLimitPolicy>;

export type PolicyName = keyof typeof POLICIES;

const globalForLimiter = globalThis as unknown as { rateLimiter?: RateLimiter };

function getLimiter(): RateLimiter {
  globalForLimiter.rateLimiter ??= new RateLimiter({
    store: getRateLimitStore(),
    prefix: "ratelimit",
    onStoreError: (error) => {
      console.warn(
        "[rate-limit] Redis indisponibil, se limitează din memoria procesului:",
        error instanceof Error ? error.message : error,
      );
    },
  });
  return globalForLimiter.rateLimiter;
}

/**
 * `subject` is what is being limited (email, session, store); it is namespaced
 * by the policy name, so budgets never bleed between policies.
 */
export function rateLimit(policy: PolicyName, subject: string, cost = 1) {
  return getLimiter().consume(`${policy}:${subject}`, POLICIES[policy], cost);
}

/** Clears a key's budget, e.g. after a successful sign-in. */
export function resetRateLimit(policy: PolicyName, subject: string) {
  return getLimiter().reset(`${policy}:${subject}`);
}
