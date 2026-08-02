import "server-only";
import { cache } from "react";
import { getActiveRuleset } from "@/lib/rules/service";
import { recordEvaluation } from "@/lib/rules/evaluation-log";
import { getEvaluationActor } from "./context";
import { readShippingMethods } from "@ruleshop/storefront";
import { computeShippingQuote, type CartShippingFacts, type ShippingQuote } from "@ruleshop/storefront";
import type { CartTotals, CartWithItems } from "./cart";

export type {
  CartShippingFacts,
  ShippingOption,
  ShippingQuote,
} from "@ruleshop/storefront";

/** Cart facts for the shipping rules, from a real cart. */
export function cartShippingFacts(
  cart: CartWithItems | null,
  totals: CartTotals,
): CartShippingFacts {
  const items = cart?.items ?? [];
  return {
    subtotalCents: totals.subtotalCents,
    itemCount: totals.itemCount,
    weightGrams: items.reduce(
      (sum, item) => sum + item.quantity * item.product.weightGrams,
      0,
    ),
    categories: [...new Set(items.map((item) => item.product.category))],
  };
}

const getShippingRuleset = cache(async (storeId: string) =>
  getActiveRuleset(storeId, "SHIPPING"),
);

export interface QuoteInput {
  storeId: string;
  /** `Store.settings`, where the configured methods come from. */
  storeSettings: unknown;
  currency: string;
  cart: CartShippingFacts;
  /** The customer's chosen method. */
  selectedMethodId?: string | null;
  /** Record the selected method's evaluation in the event history. */
  record?: "cart" | "checkout";
}

/** The store's methods run through the published SHIPPING ruleset. */
export async function quoteShipping(input: QuoteInput): Promise<ShippingQuote> {
  const ruleset = await getShippingRuleset(input.storeId);
  const actor = ruleset && !ruleset.killSwitch ? await getEvaluationActor() : undefined;

  const quote = computeShippingQuote({
    methods: readShippingMethods(input.storeSettings),
    snapshot: ruleset?.snapshot ?? null,
    killSwitch: ruleset?.killSwitch,
    cart: input.cart,
    currency: input.currency,
    actor,
    selectedMethodId: input.selectedMethodId,
  });

  // History keeps the evaluation of the method actually in use, with the same
  // per-method context the engine saw.
  if (input.record && ruleset && !ruleset.killSwitch && quote.selected) {
    recordEvaluation({
      storeId: input.storeId,
      category: "SHIPPING",
      context: {
        cart: { ...input.cart },
        customer: actor?.customer ?? {},
        session: actor?.session ?? {},
        shipping: {
          methodId: quote.selected.id,
          baseCostCents: quote.selected.baseCostCents,
        },
      },
      decision: {
        methodId: quote.selected.id,
        costCents: quote.selected.costCents,
        baseCostCents: quote.selected.baseCostCents,
        free: quote.selected.free,
        etaDaysMin: quote.selected.etaDaysMin,
        etaDaysMax: quote.selected.etaDaysMax,
      },
      matchedRuleKeys: quote.selected.matchedRules,
      rulesetVersion: quote.rulesetVersion ?? 0,
      traceId: quote.traceId ?? null,
      usedDefault: quote.selected.matchedRules.length === 0,
      source: input.record,
    });
  }

  return quote;
}
