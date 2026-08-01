import "server-only";
import { RateLimiter, type RateLimitPolicy } from "@ruleshop/rate-limit";
import { getRateLimitStore } from "./store";

export { rateLimitHeaders } from "@ruleshop/rate-limit";
export type { RateLimitResult } from "@ruleshop/rate-limit";

/**
 * Politicile de limitare, într-un singur loc.
 *
 * Le ținem grupate ca să se poată răspunde dintr-o privire la „ce e limitat și
 * cât", în loc să fie numere risipite prin handlere. Fiecare spune și ce se
 * întâmplă dacă Redis cade — decizia nu este aceeași peste tot.
 */
export const POLICIES = {
  /**
   * Anti brute-force pe cont. `burst: 3` lasă câteva greșeli de tastare
   * consecutive, dar apoi forțează un ritm lent; `deny` la Redis căzut, pentru
   * că un magazin de stare indisponibil nu e un motiv bun să deschidem
   * autentificarea (rezerva din memorie ar prinde oricum majoritatea cazurilor,
   * dar aici preferăm să nu depindem de asta).
   */
  login: { limit: 10, windowSeconds: 600, burst: 3, onStoreError: "deny" },

  /** Codul de comandă are 6 cifre — fără plafon ar putea fi ghicit. */
  orderChallenge: { limit: 5, windowSeconds: 900, burst: 2, onStoreError: "deny" },

  /** Plasările repetate rapid sunt fie o eroare de UI, fie abuz. */
  checkout: { limit: 5, windowSeconds: 60, burst: 2 },

  /** Încărcările de imagini din control plane. */
  uploads: { limit: 60, windowSeconds: 60 },

  /** Cotele cheii Gemini: un buton apăsat în buclă nu trebuie să le consume. */
  aiAnalyze: { limit: 10, windowSeconds: 3600, burst: 3 },
  aiGenerate: { limit: 20, windowSeconds: 3600, burst: 5 },
  aiClassify: { limit: 30, windowSeconds: 3600, burst: 5 },

  /**
   * Plafon de scriere în istoricul de evaluări. Aici limitarea e igienă, nu
   * securitate: dacă Redis lipsește, e mai bine să scriem istoricul decât să-l
   * pierdem.
   */
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
 * Consumă o unitate din bugetul unei chei, sub o politică denumită.
 *
 * `subject` este ce anume limităm (email, sesiune, magazin) — se adaugă la
 * numele politicii, deci bugetele nu se amestecă între politici.
 */
export function rateLimit(policy: PolicyName, subject: string, cost = 1) {
  return getLimiter().consume(`${policy}:${subject}`, POLICIES[policy], cost);
}

/** Șterge bugetul unei chei — de exemplu după un login reușit. */
export function resetRateLimit(policy: PolicyName, subject: string) {
  return getLimiter().reset(`${policy}:${subject}`);
}
