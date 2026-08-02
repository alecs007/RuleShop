import "server-only";
import { cache } from "react";
import { getActiveRuleset } from "@/lib/rules/service";
import { recordEvaluation } from "@/lib/rules/evaluation-log";
import { getEvaluationActor } from "./context";
import {
  computeLoyalty,
  type LoyaltyCartFacts,
  type LoyaltyOrderFacts,
  type LoyaltyView,
} from "@ruleshop/storefront";

export type {
  LoyaltyCartFacts,
  LoyaltyOrderFacts,
  LoyaltyView,
} from "@ruleshop/storefront";
export {
  basePointsFor,
  CENTS_PER_POINT,
  DEFAULT_LOYALTY_TIER,
  explainLoyalty,
  pointsLabel,
} from "@ruleshop/storefront";

const getLoyaltyRuleset = cache(async (storeId: string) =>
  getActiveRuleset(storeId, "LOYALTY"),
);

export interface LoyaltyInput {
  storeId: string;
  cart: LoyaltyCartFacts;
  /** Order facts; present only at checkout, where the total is known. */
  order?: LoyaltyOrderFacts;
  /** Record the evaluation in the event history. */
  record?: "cart" | "checkout" | "account";
}

/**
 * Note the ordering at checkout: `customer.completedOrders` and
 * `lifetimeSpend` reflect the state before the current order, on purpose — a
 * "double points on your 5th order" rule must count finished orders, or it
 * would fire one order early.
 */
export async function getLoyaltyView(input: LoyaltyInput): Promise<LoyaltyView> {
  const ruleset = await getLoyaltyRuleset(input.storeId);
  const actor = await getEvaluationActor();

  const view = computeLoyalty({
    snapshot: ruleset?.snapshot ?? null,
    killSwitch: ruleset?.killSwitch,
    cart: input.cart,
    order: input.order,
    actor,
  });

  // Only evaluations against a real ruleset are worth replaying.
  if (input.record && ruleset && !ruleset.killSwitch) {
    recordEvaluation({
      storeId: input.storeId,
      category: "LOYALTY",
      // The same context computeLoyalty builds.
      context: {
        cart: { ...input.cart },
        ...(input.order ? { order: { ...input.order } } : {}),
        customer: actor.customer,
        session: actor.session,
      },
      decision: {
        basePoints: view.basePoints,
        pointsMultiplier: view.pointsMultiplier,
        bonusPoints: view.bonusPoints,
        points: view.points,
        benefits: view.benefits,
        tier: view.tier,
      },
      matchedRuleKeys: view.matchedRules,
      rulesetVersion: view.rulesetVersion ?? 0,
      traceId: view.traceId,
      usedDefault: view.matchedRules.length === 0,
      source: input.record,
    });
  }

  return view;
}

/**
 * The account's current benefits and tier, with no order in progress. The same
 * ruleset is evaluated against an empty cart, so only customer-dependent
 * benefits show up here.
 */
export async function getAccountLoyalty(storeId: string): Promise<LoyaltyView> {
  return getLoyaltyView({
    storeId,
    cart: { subtotalCents: 0, itemCount: 0, weightGrams: 0, categories: [] },
  });
}
