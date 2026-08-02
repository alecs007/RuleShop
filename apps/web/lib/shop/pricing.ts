import "server-only";
import { cache } from "react";
import type { Product } from "@prisma/client";
import { evaluateRuleSet } from "@ruleshop/rule-engine";
import { getActiveRuleset } from "@/lib/rules/service";
import { recordEvaluation } from "@/lib/rules/evaluation-log";
import { applyPricingDecision } from "@ruleshop/storefront";
import { getEvaluationActor } from "./context";

export interface PriceViewOptions {
  /**
   * Record the evaluation in the event history. Asked for only at the points
   * that matter — product page, checkout — not for every catalog card.
   */
  record?: "product-page" | "checkout" | "cart";
}

/**
 * A product's price as the published PRICING ruleset decides it. The UI only
 * ever consumes PriceView, so a rule change moves the storefront with no code
 * change at all.
 */
export interface PriceView {
  baseCents: number;
  finalCents: number;
  discountPercent: number;
  currency: string;
  badges: string[];
  /** The rules behind the price, and the version used. */
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
