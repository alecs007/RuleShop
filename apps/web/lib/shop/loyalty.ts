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
} from "./loyalty-view";

export type {
  LoyaltyCartFacts,
  LoyaltyOrderFacts,
  LoyaltyView,
} from "./loyalty-view";
export {
  basePointsFor,
  CENTS_PER_POINT,
  DEFAULT_LOYALTY_TIER,
  explainLoyalty,
  pointsLabel,
} from "./loyalty-view";

const getLoyaltyRuleset = cache(async (storeId: string) =>
  getActiveRuleset(storeId, "LOYALTY"),
);

export interface LoyaltyInput {
  storeId: string;
  cart: LoyaltyCartFacts;
  /** Faptele comenzii; exista doar la checkout, cand totalul e cunoscut. */
  order?: LoyaltyOrderFacts;
  /** Inregistreaza evaluarea in istoricul de evenimente. */
  record?: "cart" | "checkout" | "account";
}

/**
 * Recompensele de loialitate pentru vizitatorul curent: rulesetul LOYALTY
 * publicat, evaluat cu faptele cosului si ale clientului din sesiune.
 *
 * Atentie la ordinea din checkout: faptele `customer.completedOrders` si
 * `customer.lifetimeSpend` reflecta starea de DINAINTE de comanda curenta
 * (se resincronizeaza dupa creare). Asta e intentionat — o regula „la a 5-a
 * comanda primesti dublu" trebuie sa se uite la comenzile deja finalizate,
 * altfel s-ar declanșa cu o comanda mai devreme.
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

  // Doar evaluarile pe ruleset real intra in istoric: fara versiune publicata
  // nu exista nimic de re-simulat.
  if (input.record && ruleset && !ruleset.killSwitch) {
    recordEvaluation({
      storeId: input.storeId,
      category: "LOYALTY",
      // Acelasi context pe care il construieste computeLoyalty.
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
 * Beneficiile si nivelul curent al contului, fara nicio comanda in curs — pentru
 * pagina „Contul meu". Se evalueaza acelasi ruleset cu un cos gol, deci o regula
 * condiționata pe cos (ex: „coș peste 500 lei") nu apare aici; apar doar
 * beneficiile care depind de client.
 */
export async function getAccountLoyalty(storeId: string): Promise<LoyaltyView> {
  return getLoyaltyView({
    storeId,
    cart: { subtotalCents: 0, itemCount: 0, weightGrams: 0, categories: [] },
  });
}
