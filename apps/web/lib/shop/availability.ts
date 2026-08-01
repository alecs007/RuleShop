import "server-only";
import { cache } from "react";
import type { Product } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getActiveRuleset } from "@/lib/rules/service";
import { recordEvaluation } from "@/lib/rules/evaluation-log";
import { getEvaluationActor } from "./context";
import {
  computeAvailability,
  type AvailabilityView,
  type ProductAvailabilityFacts,
} from "./availability-view";

export type {
  AvailabilityReason,
  AvailabilityView,
  ProductAvailabilityFacts,
} from "./availability-view";
export {
  availabilityLabel,
  availabilityTone,
  clampQuantity,
  unavailableMessage,
} from "./availability-view";

/** Cate produse se evalueaza cel mult la scanarea catalogului pentru „ascunse". */
const HIDDEN_SCAN_LIMIT = 500;

const getAvailabilityRuleset = cache(async (storeId: string) =>
  getActiveRuleset(storeId, "AVAILABILITY"),
);

/** Faptele de produs pentru motor, dintr-un rand din baza de date. */
export function availabilityFacts(
  product: Pick<
    Product,
    | "id"
    | "sku"
    | "name"
    | "category"
    | "brand"
    | "basePriceCents"
    | "stock"
    | "tags"
    | "attributes"
  >,
): ProductAvailabilityFacts {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    brand: product.brand,
    basePriceCents: product.basePriceCents,
    stock: product.stock,
    tags: product.tags,
    attributes: (product.attributes ?? {}) as Record<string, unknown>,
  };
}

/**
 * Disponibilitatea unui produs pentru vizitatorul curent: rulesetul
 * AVAILABILITY publicat, evaluat cu faptele produsului si ale clientului.
 * Fara versiune publicata (sau cu kill switch) conteaza doar stocul.
 */
export async function getAvailabilityView(
  product: Product,
  options: { record?: "product-page" | "cart" | "checkout" } = {},
): Promise<AvailabilityView> {
  const ruleset = await getAvailabilityRuleset(product.storeId);
  const actor = ruleset && !ruleset.killSwitch ? await getEvaluationActor() : undefined;

  const facts = availabilityFacts(product);
  const view = computeAvailability({
    product: facts,
    snapshot: ruleset?.snapshot ?? null,
    killSwitch: ruleset?.killSwitch,
    actor,
  });

  // Doar evaluarile pe ruleset real intra in istoric: fara versiune publicata
  // nu exista nimic de re-simulat.
  if (options.record && ruleset && !ruleset.killSwitch) {
    recordEvaluation({
      storeId: product.storeId,
      category: "AVAILABILITY",
      // Acelasi context pe care il construieste computeAvailability.
      context: {
        product: {
          id: facts.id,
          sku: facts.sku,
          name: facts.name,
          category: facts.category,
          brand: facts.brand,
          basePriceCents: facts.basePriceCents,
          stock: Math.max(0, facts.stock),
          tags: facts.tags,
          ...(facts.attributes ?? {}),
        },
        customer: actor?.customer ?? {},
        session: actor?.session ?? {},
      },
      decision: {
        available: view.available,
        hidden: view.hidden,
        maxPerOrder: view.maxPerOrder,
        badges: view.badges,
        message: view.message,
        reason: view.reason,
      },
      matchedRuleKeys: view.matchedRules,
      rulesetVersion: view.rulesetVersion ?? 0,
      traceId: view.traceId,
      usedDefault: view.matchedRules.length === 0,
      source: options.record,
    });
  }

  return view;
}

export async function getAvailabilityViews(
  products: Product[],
): Promise<Map<string, AvailabilityView>> {
  const entries = await Promise.all(
    products.map(async (p) => [p.id, await getAvailabilityView(p)] as const),
  );
  return new Map(entries);
}

/**
 * Produsele ascunse de reguli (HIDE_PRODUCT) pentru vizitatorul curent.
 *
 * Ascunderea se aplica INAINTE de paginare, altfel numaratorile si paginile ar
 * fi gresite — deci are nevoie de o scanare a catalogului. Scanarea se face
 * doar cand rulesetul activ chiar contine o regula care poate ascunde ceva;
 * in rest costul este zero.
 */
export const getHiddenProductIds = cache(
  async (storeId: string): Promise<string[]> => {
    const ruleset = await getAvailabilityRuleset(storeId);
    if (!ruleset || ruleset.killSwitch) return [];

    const canHide = ruleset.snapshot.rules.some(
      (rule) =>
        rule.enabled &&
        rule.actions.some((action) => action.type === "HIDE_PRODUCT"),
    );
    if (!canHide) return [];

    const [products, actor] = await Promise.all([
      prisma.product.findMany({
        where: { storeId, active: true },
        select: {
          id: true,
          sku: true,
          name: true,
          category: true,
          brand: true,
          basePriceCents: true,
          stock: true,
          tags: true,
          attributes: true,
        },
        take: HIDDEN_SCAN_LIMIT,
      }),
      getEvaluationActor(),
    ]);

    return products
      .filter(
        (product) =>
          computeAvailability({
            product: availabilityFacts(product),
            snapshot: ruleset.snapshot,
            actor,
          }).hidden,
      )
      .map((product) => product.id);
  },
);
