/**
 * Stock says what exists; the AVAILABILITY ruleset says what can be bought and
 * seen. Rules can only restrict — they cannot invent stock, since the order
 * would fail at the atomic stock decrement anyway.
 */
import { evaluateRuleSet, type RuleSetSnapshot } from "@ruleshop/rule-engine";
import type { ActorFacts } from "./types";

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** Absolute per-order cap, whatever the rules say. */
export const HARD_QUANTITY_CAP = 99;

export interface ProductAvailabilityFacts {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  basePriceCents: number;
  stock: number;
  tags: string[];
  attributes?: Record<string, unknown>;
}


const GUEST_ACTOR: ActorFacts = {
  customer: { loyaltyTier: "STANDARD", completedOrders: 0 },
  session: { isGuest: true, isAuthenticated: false },
};

export type AvailabilityReason =
  | "in-stock"
  | "low-stock"
  | "out-of-stock"
  | "blocked-by-rule"
  | "hidden-by-rule";

export interface AvailabilityView {
  productId: string;
  available: boolean;
  /** Pulled from the catalog by a rule: no listings, the page 404s. */
  hidden: boolean;
  stock: number;
  /** 0 when unavailable. */
  maxPerOrder: number;
  /** The cap a rule imposed; null means only stock limits. */
  ruleLimit: number | null;
  lowStock: boolean;
  lowStockThreshold: number;
  badges: string[];
  message: string | null;
  reason: AvailabilityReason;
  matchedRules: string[];
  rulesetVersion: number | null;
  traceId: string | null;
  /** true when no ruleset is published or the kill switch is on. */
  usedDefaults: boolean;
}

export interface AvailabilityComputation {
  product: ProductAvailabilityFacts;
  /** The published snapshot; null means nothing has been published. */
  snapshot: RuleSetSnapshot | null;
  killSwitch?: boolean;
  actor?: ActorFacts;
  /** Fixed instant, for reproducible simulations. */
  now?: string;
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function reasonOf(view: {
  hidden: boolean;
  ruleBlocked: boolean;
  stock: number;
  available: boolean;
  lowStock: boolean;
}): AvailabilityReason {
  if (view.hidden) return "hidden-by-rule";
  if (view.stock <= 0) return "out-of-stock";
  if (!view.available || view.ruleBlocked) return "blocked-by-rule";
  return view.lowStock ? "low-stock" : "in-stock";
}

/** Behaviour without rules: only stock matters. */
function defaultView(
  product: ProductAvailabilityFacts,
  rulesetVersion: number | null,
): AvailabilityView {
  const stock = Math.max(0, product.stock);
  const available = stock > 0;
  const lowStock = available && stock <= DEFAULT_LOW_STOCK_THRESHOLD;

  return {
    productId: product.id,
    available,
    hidden: false,
    stock,
    maxPerOrder: available ? Math.min(stock, HARD_QUANTITY_CAP) : 0,
    ruleLimit: null,
    lowStock,
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    badges: [],
    message: null,
    reason: reasonOf({
      hidden: false,
      ruleBlocked: false,
      stock,
      available,
      lowStock,
    }),
    matchedRules: [],
    rulesetVersion,
    traceId: null,
    usedDefaults: true,
  };
}

export function computeAvailability(
  input: AvailabilityComputation,
): AvailabilityView {
  const { product, snapshot } = input;
  const stock = Math.max(0, product.stock);

  if (!snapshot || input.killSwitch) {
    return defaultView(product, snapshot?.version ?? null);
  }

  const actor = input.actor ?? GUEST_ACTOR;
  const result = evaluateRuleSet(snapshot, {
    ...(input.now ? { now: input.now } : {}),
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      brand: product.brand,
      basePriceCents: product.basePriceCents,
      stock,
      tags: product.tags,
      ...(product.attributes ?? {}),
    },
    customer: actor.customer,
    session: actor.session,
  });

  const decision = result.decision;
  const hidden = decision.hidden === true;
  // Only an explicit `false` blocks; anything else leaves it to stock.
  const ruleBlocked = decision.available === false;
  const ruleLimit = positiveInt(decision.maxQuantityPerOrder);
  const threshold =
    positiveInt(decision.lowStockThreshold) ?? DEFAULT_LOW_STOCK_THRESHOLD;

  const available = stock > 0 && !hidden && !ruleBlocked && ruleLimit !== 0;
  const maxPerOrder = available
    ? Math.min(stock, ruleLimit ?? HARD_QUANTITY_CAP, HARD_QUANTITY_CAP)
    : 0;
  const lowStock = available && stock <= threshold;

  const message =
    typeof decision.message === "string" && decision.message.trim() !== ""
      ? decision.message.trim()
      : null;
  const badges = Array.isArray(decision.badges)
    ? decision.badges.filter((b): b is string => typeof b === "string")
    : [];

  return {
    productId: product.id,
    available,
    hidden,
    stock,
    maxPerOrder,
    ruleLimit,
    lowStock,
    lowStockThreshold: threshold,
    badges,
    message,
    reason: reasonOf({ hidden, ruleBlocked, stock, available, lowStock }),
    matchedRules: result.matchedRules,
    rulesetVersion: result.rulesetVersion,
    traceId: result.traceId,
    usedDefaults: false,
  };
}

export function availabilityLabel(view: AvailabilityView): string {
  if (view.message) return view.message;
  switch (view.reason) {
    case "hidden-by-rule":
      return "Ascuns din catalog";
    case "blocked-by-rule":
      return "Indisponibil";
    case "out-of-stock":
      return "Stoc epuizat";
    case "low-stock":
      return `Ultimele ${view.stock} bucăți`;
    default:
      return "În stoc";
  }
}

export type AvailabilityTone = "positive" | "caution" | "critical";

export function availabilityTone(view: AvailabilityView): AvailabilityTone {
  if (!view.available) return "critical";
  return view.lowStock ? "caution" : "positive";
}

export type QuantityLimit = "stock" | "rule" | null;

export interface ClampedQuantity {
  quantity: number;
  limitedBy: QuantityLimit;
}

/** `limitedBy` says what cut the quantity, so the customer can be told why. */
export function clampQuantity(
  view: AvailabilityView,
  requested: number,
): ClampedQuantity {
  if (!view.available || view.maxPerOrder <= 0) {
    return { quantity: 0, limitedBy: view.ruleLimit === 0 ? "rule" : "stock" };
  }
  if (requested <= view.maxPerOrder) {
    return { quantity: Math.max(0, Math.floor(requested)), limitedBy: null };
  }
  // A rule cap tighter than stock means the rule cut it, not the stock.
  const limitedBy: QuantityLimit =
    view.ruleLimit !== null && view.ruleLimit <= view.stock ? "rule" : "stock";
  return { quantity: view.maxPerOrder, limitedBy };
}

export function unavailableMessage(
  view: AvailabilityView,
  productName: string,
): string {
  switch (view.reason) {
    case "hidden-by-rule":
    case "blocked-by-rule":
      return view.message ?? `„${productName}" nu mai este disponibil.`;
    case "out-of-stock":
      return `„${productName}" nu mai este în stoc.`;
    default:
      return `„${productName}" nu poate fi comandat acum.`;
  }
}
