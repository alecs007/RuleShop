import "server-only";
import type { Product } from "@prisma/client";

/**
 * Prezentarea de pret a unui produs — PUNCTUL DE EXTENSIE pentru rule engine.
 *
 * Astazi intoarce pretul de baza. Cand API-ul de decisioning va fi conectat,
 * aceasta functie va evalua rulesetul PRICING (snapshot stable/canary) si va
 * intoarce pretul final + regulile care au contribuit, fara ca vreun
 * component de UI sa se schimbe: toate afiseaza deja `PriceView`.
 */
export interface PriceView {
  baseCents: number;
  finalCents: number;
  discountPercent: number;
  currency: string;
  badges: string[];
  /** Cheile regulilor care au produs pretul (gol pana la integrare). */
  matchedRules: string[];
}

export async function getPriceView(product: Product): Promise<PriceView> {
  // TODO(rules): inlocuieste cu evaluarea rulesetului PRICING prin
  // API-ul de decisioning (lib/engine + snapshot publicat).
  return {
    baseCents: product.basePriceCents,
    finalCents: product.basePriceCents,
    discountPercent: 0,
    currency: product.currency,
    badges: [],
    matchedRules: [],
  };
}

export async function getPriceViews(
  products: Product[],
): Promise<Map<string, PriceView>> {
  const entries = await Promise.all(
    products.map(async (p) => [p.id, await getPriceView(p)] as const),
  );
  return new Map(entries);
}
