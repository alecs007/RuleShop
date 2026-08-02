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
} from "@ruleshop/storefront";

export type {
  AvailabilityReason,
  AvailabilityView,
  ProductAvailabilityFacts,
} from "@ruleshop/storefront";
export {
  availabilityLabel,
  availabilityTone,
  clampQuantity,
  unavailableMessage,
} from "@ruleshop/storefront";

/** How many products the hidden-product catalog scan evaluates at most. */
const HIDDEN_SCAN_LIMIT = 500;

const getAvailabilityRuleset = cache(async (storeId: string) =>
  getActiveRuleset(storeId, "AVAILABILITY"),
);

/** Engine product facts, from a database row. */
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

/** Without a published version, or with the kill switch on, only stock counts. */
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

  // Only evaluations against a real ruleset are worth replaying.
  if (options.record && ruleset && !ruleset.killSwitch) {
    recordEvaluation({
      storeId: product.storeId,
      category: "AVAILABILITY",
      // The same context computeAvailability builds.
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
 * Hiding is applied before pagination, or counts and pages would be wrong, so
 * it needs a catalog scan. The scan only runs when the active ruleset actually
 * contains a rule that can hide something.
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
