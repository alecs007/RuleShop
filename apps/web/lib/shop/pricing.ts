import "server-only";
import { cache } from "react";
import type { Product } from "@prisma/client";
import { evaluateRuleSet } from "@ruleshop/rule-engine";
import { getActiveRuleset } from "@/lib/rules/service";
import { recordEvaluation } from "@/lib/rules/evaluation-log";
import { applyPricingDecision } from "./pricing-decision";
import { getEvaluationActor } from "./context";

export interface PriceViewOptions {
  /**
   * Inregistreaza evaluarea in istoricul de evenimente (pentru istoric si
   * simulare IA). Se cere explicit doar in punctele semnificative — pagina de
   * produs si checkout — nu la fiecare card din catalog.
   */
  record?: "product-page" | "checkout" | "cart";
}

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

export async function getPriceView(
  product: Product,
  options: PriceViewOptions = {},
): Promise<PriceView> {
  const ruleset = await getPricingRuleset(product.storeId);
  if (!ruleset) return basePriceView(product);

  const actor = await getEvaluationActor();
  const context = {
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
  };
  const result = evaluateRuleSet(ruleset.snapshot, context, {
    killSwitch: ruleset.killSwitch,
  });

  const finalCents = applyPricingDecision(product.basePriceCents, result.decision);
  const discountPercent =
    finalCents < product.basePriceCents
      ? Math.round((1 - finalCents / product.basePriceCents) * 100)
      : 0;

  if (options.record) {
    recordEvaluation({
      storeId: product.storeId,
      category: "PRICING",
      context,
      decision: { baseCents: product.basePriceCents, finalCents, discountPercent },
      matchedRuleKeys: result.matchedRules,
      rulesetVersion: result.rulesetVersion,
      traceId: result.traceId,
      usedDefault: result.usedDefault,
      source: options.record,
    });
  }

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
  options: PriceViewOptions = {},
): Promise<Map<string, PriceView>> {
  const entries = await Promise.all(
    products.map(async (p) => [p.id, await getPriceView(p, options)] as const),
  );
  return new Map(entries);
}
