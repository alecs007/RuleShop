/**
 * Loyalty rewards. The order value gives a base number of points; the LOYALTY
 * ruleset multiplies it, adds bonuses and benefits, and may show another tier.
 * With no ruleset the customer still earns the base points.
 *
 * The tier a rule decides is never written back to the account:
 * `customer.loyaltyTier` is an input fact, so persisting it would let a rule
 * read its own output and feed itself. Only the points balance is stored.
 */
import { evaluateRuleSet, type RuleSetSnapshot } from "@ruleshop/rule-engine";
import type { ActorFacts } from "./types";

/** One point per currency unit spent. */
export const CENTS_PER_POINT = 100;

/** Also enforced at validation; this keeps older snapshots harmless. */
export const MAX_POINTS_MULTIPLIER = 50;

export const DEFAULT_LOYALTY_TIER = "STANDARD";

export interface LoyaltyCartFacts {
  subtotalCents: number;
  itemCount: number;
  weightGrams: number;
  categories: string[];
}

/** Absent before checkout. */
export interface LoyaltyOrderFacts {
  totalCents: number;
  shippingCents: number;
  paymentMethod?: string;
}


const GUEST_ACTOR: ActorFacts = {
  customer: { loyaltyTier: DEFAULT_LOYALTY_TIER, loyaltyPoints: 0, completedOrders: 0 },
  session: { isGuest: true, isAuthenticated: false },
};

export interface LoyaltyView {
  /** The subtotal points are earned on: after discounts, without shipping. */
  eligibleCents: number;
  /** Points from the order value, before rules. */
  basePoints: number;
  pointsMultiplier: number;
  bonusPoints: number;
  /** round(basePoints x multiplier) + bonus. */
  points: number;
  extraPoints: number;
  benefits: string[];
  /** The tier a rule imposed, otherwise the account's own. */
  tier: string;
  tierFromRule: boolean;
  /**
   * Guests have no account to accrue on: their points are computed and shown,
   * so they can see what an account would earn them, but never granted.
   */
  creditable: boolean;
  matchedRules: string[];
  rulesetVersion: number | null;
  traceId: string | null;
  /** true when no ruleset is published or the kill switch is on. */
  usedDefaults: boolean;
}

export interface LoyaltyComputation {
  /** The published snapshot; null means nothing has been published. */
  snapshot: RuleSetSnapshot | null;
  killSwitch?: boolean;
  cart: LoyaltyCartFacts;
  order?: LoyaltyOrderFacts;
  actor?: ActorFacts;
  /** Fixed instant, for reproducible simulations. */
  now?: string;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function tierOf(actor: ActorFacts): string {
  const tier = actor.customer.loyaltyTier;
  return typeof tier === "string" && tier.trim() !== ""
    ? tier.trim()
    : DEFAULT_LOYALTY_TIER;
}

/** Rounds down, in nobody's favour. */
export function basePointsFor(eligibleCents: number): number {
  return Math.floor(Math.max(0, eligibleCents) / CENTS_PER_POINT);
}

export function computeLoyalty(input: LoyaltyComputation): LoyaltyView {
  const { snapshot, cart } = input;
  const actor = input.actor ?? GUEST_ACTOR;
  const creditable = actor.session.isAuthenticated === true;

  const eligibleCents = Math.max(0, cart.subtotalCents);
  const basePoints = basePointsFor(eligibleCents);

  if (!snapshot || input.killSwitch) {
    return {
      eligibleCents,
      basePoints,
      pointsMultiplier: 1,
      bonusPoints: 0,
      points: basePoints,
      extraPoints: 0,
      benefits: [],
      tier: tierOf(actor),
      tierFromRule: false,
      creditable,
      matchedRules: [],
      rulesetVersion: snapshot?.version ?? null,
      traceId: null,
      usedDefaults: true,
    };
  }

  const result = evaluateRuleSet(snapshot, {
    ...(input.now ? { now: input.now } : {}),
    cart,
    ...(input.order ? { order: input.order } : {}),
    customer: actor.customer,
    session: actor.session,
  });
  const decision = result.decision;

  const pointsMultiplier = Math.min(
    MAX_POINTS_MULTIPLIER,
    positiveNumber(decision.pointsMultiplier, 1),
  );
  const bonusPoints = Math.floor(positiveNumber(decision.bonusPoints, 0));
  const points = Math.round(basePoints * pointsMultiplier) + bonusPoints;

  const benefits = Array.isArray(decision.benefits)
    ? [
        ...new Set(
          decision.benefits.filter(
            (b): b is string => typeof b === "string" && b.trim() !== "",
          ),
        ),
      ]
    : [];

  const ruleTier =
    typeof decision.tier === "string" && decision.tier.trim() !== ""
      ? decision.tier.trim()
      : null;

  return {
    eligibleCents,
    basePoints,
    pointsMultiplier,
    bonusPoints,
    points,
    extraPoints: points - basePoints,
    benefits,
    tier: ruleTier ?? tierOf(actor),
    tierFromRule: ruleTier !== null,
    creditable,
    matchedRules: result.matchedRules,
    rulesetVersion: result.rulesetVersion,
    traceId: result.traceId,
    usedDefaults: false,
  };
}

export function pointsLabel(points: number): string {
  return `${points} ${points === 1 ? "punct" : "puncte"}`;
}

export function explainLoyalty(view: LoyaltyView): string {
  if (view.points === 0) {
    return view.usedDefaults
      ? "Nicio regulă activă — comanda nu acumulează puncte."
      : "Comanda nu acumulează puncte.";
  }

  const parts: string[] = [`${pointsLabel(view.basePoints)} din valoarea comenzii`];
  if (view.pointsMultiplier !== 1) {
    parts.push(`× ${view.pointsMultiplier}`);
  }
  if (view.bonusPoints > 0) {
    parts.push(`+ ${pointsLabel(view.bonusPoints)} bonus`);
  }
  return parts.join(" ");
}
