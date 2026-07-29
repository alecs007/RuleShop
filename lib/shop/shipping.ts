import "server-only";
import { cache } from "react";
import { getActiveRuleset } from "@/lib/rules/service";
import { getEvaluationActor } from "./context";
import { readShippingMethods } from "./shipping-methods";
import { computeShippingQuote, type CartShippingFacts, type ShippingQuote } from "./shipping-quote";
import type { CartTotals, CartWithItems } from "./cart";

export type {
  CartShippingFacts,
  ShippingOption,
  ShippingQuote,
} from "./shipping-quote";

/** Faptele de cos pentru regulile de livrare, dintr-un cos real. */
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
  /** `Store.settings` — de aici vin metodele configurate ale magazinului. */
  storeSettings: unknown;
  currency: string;
  cart: CartShippingFacts;
  /** Metoda aleasa de client (Cart.shippingMethodId). */
  selectedMethodId?: string | null;
}

/**
 * Cotatia de livrare pentru cererea curenta: metodele magazinului trecute prin
 * rulesetul SHIPPING publicat, cu faptele clientului din sesiune.
 */
export async function quoteShipping(input: QuoteInput): Promise<ShippingQuote> {
  const ruleset = await getShippingRuleset(input.storeId);
  const actor = ruleset && !ruleset.killSwitch ? await getEvaluationActor() : undefined;

  return computeShippingQuote({
    methods: readShippingMethods(input.storeSettings),
    snapshot: ruleset?.snapshot ?? null,
    killSwitch: ruleset?.killSwitch,
    cart: input.cart,
    currency: input.currency,
    actor,
    selectedMethodId: input.selectedMethodId,
  });
}
