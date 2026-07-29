import "server-only";
import { cache } from "react";
import type { Product } from "@prisma/client";
import { evaluateRuleSet } from "@/lib/engine";
import { getActiveRuleset } from "@/lib/rules/service";
import { getEvaluationActor } from "./context";

/**
 * Prezentarea de pret a unui produs — rezultatul evaluarii rulesetului
 * PRICING publicat. Fara versiune publicata (sau cu kill switch activ),
 * pretul ramane cel de baza. UI-ul consuma doar PriceView, deci orice
 * schimbare de reguli modifica magazinul fara nicio modificare de cod.
 */
export interface PriceView {
  baseCents: number;
  finalCents: number;
  discountPercent: number;
  currency: string;
  badges: string[];
  /** Cheile regulilor care au produs pretul + versiunea folosita. */
  matchedRules: string[];
  rulesetVersion: number | null;
  traceId: string | null;
}

function basePriceView(product: Product): PriceView {
  return {
    baseCents: product.basePriceCents,
    finalCents: product.basePriceCents,
    discountPercent: 0,
    currency: product.currency,
    badges: [],
    matchedRules: [],
    rulesetVersion: null,
    traceId: null,
  };
}

const getPricingRuleset = cache(async (storeId: string) =>
  getActiveRuleset(storeId, "PRICING"),
);

/** Aplica decizia PRICING peste pretul de baza, cu clamp la [0, base*10]. */
function applyPricingDecision(
  baseCents: number,
  decision: Record<string, unknown>,
): number {
  const override = decision.priceOverrideCents;
  if (typeof override === "number" && override >= 0) return Math.round(override);

  let final = baseCents;
  if (typeof decision.priceMultiplier === "number" && decision.priceMultiplier >= 0) {
    final *= decision.priceMultiplier;
  }
  if (typeof decision.discountPercent === "number") {
    final -= (final * Math.min(100, Math.max(0, decision.discountPercent))) / 100;
  }
  if (typeof decision.discountFixedCents === "number") {
    final -= Math.max(0, decision.discountFixedCents);
  }
  return Math.max(0, Math.min(Math.round(final), baseCents * 10));
}

export async function getPriceView(product: Product): Promise<PriceView> {
  const ruleset = await getPricingRuleset(product.storeId);
  if (!ruleset) return basePriceView(product);

  const actor = await getEvaluationActor();
  const result = evaluateRuleSet(
    ruleset.snapshot,
    {
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        brand: product.brand,
        basePriceCents: product.basePriceCents,
        stock: product.stock,
        tags: product.tags,
        ...((product.attributes ?? {}) as Record<string, unknown>),
      },
      customer: actor.customer,
      session: actor.session,
    },
    { killSwitch: ruleset.killSwitch },
  );

  const finalCents = applyPricingDecision(product.basePriceCents, result.decision);
  const discountPercent =
    finalCents < product.basePriceCents
      ? Math.round((1 - finalCents / product.basePriceCents) * 100)
      : 0;

  return {
    baseCents: product.basePriceCents,
    finalCents,
    discountPercent,
    currency: product.currency,
    badges: Array.isArray(result.decision.badges)
      ? (result.decision.badges as string[])
      : [],
    matchedRules: result.matchedRules,
    rulesetVersion: result.rulesetVersion,
    traceId: result.traceId,
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
