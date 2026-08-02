/**
 * Replays a snapshot over historical events. The application re-evaluates the
 * stored contexts with its own engine and computes every statistic itself; the
 * AI only interprets the finished metrics.
 */
import {
  evaluateRuleSet,
  type EvaluationContext,
  type RuleSetSnapshot,
} from "@ruleshop/rule-engine";
import { applyPricingDecision } from "@ruleshop/storefront";
import { decisionFromScore, readThresholds } from "@ruleshop/storefront";
import { basePointsFor } from "@ruleshop/storefront";

export interface SimulationEvent {
  /** The fact context exactly as the engine saw it at the time. */
  context: Record<string, unknown>;
}

export interface RuleSimulationStats {
  /** How often the rule's conditions matched. */
  matched: number;
  /** How often it won the conflict and its actions were applied. */
  applied: number;
}

/** A snapshot's metrics over a set of events. */
export interface SnapshotMetrics {
  evaluations: number;
  /** Evaluations where at least one rule reached the decision. */
  matchedEvaluations: number;
  usedDefault: number;
  perRule: Record<string, RuleSimulationStats>;
  /** Category-specific aggregates, all numeric. */
  aggregates: Record<string, number>;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function contextNumber(context: Record<string, unknown>, path: string[]): number | null {
  let cursor: unknown = context;
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return num(cursor);
}

/** Rounded mean; 0 for empty sets. */
function avg(sum: number, count: number): number {
  return count > 0 ? Math.round(sum / count) : 0;
}

interface AggregateAccumulator {
  add(context: Record<string, unknown>, decision: Record<string, unknown>): void;
  finish(evaluations: number): Record<string, number>;
}

function pricingAggregator(): AggregateAccumulator {
  let discounted = 0;
  let discountCentsSum = 0;
  let discountPercentSum = 0;
  let priced = 0;
  return {
    add(context, decision) {
      const base = contextNumber(context, ["product", "basePriceCents"]);
      if (base === null || base <= 0) return;
      priced += 1;
      const final = applyPricingDecision(base, decision);
      if (final < base) {
        discounted += 1;
        discountCentsSum += base - final;
        discountPercentSum += (1 - final / base) * 100;
      }
    },
    finish(evaluations) {
      return {
        discountedEvaluations: discounted,
        discountedShare: priced > 0 ? Math.round((discounted / priced) * 100) : 0,
        avgDiscountPercent: discounted > 0 ? Math.round(discountPercentSum / discounted) : 0,
        avgDiscountCents: avg(discountCentsSum, discounted),
        totalDiscountCents: discountCentsSum,
        evaluationsConsidered: priced || evaluations,
      };
    },
  };
}

function shippingAggregator(): AggregateAccumulator {
  let costSum = 0;
  let free = 0;
  let counted = 0;
  return {
    add(context, decision) {
      const baseCost = contextNumber(context, ["shipping", "baseCostCents"]) ?? 0;
      const cost =
        decision.freeShipping === true ? 0 : (num(decision.costCents) ?? baseCost);
      counted += 1;
      costSum += cost;
      if (cost === 0) free += 1;
    },
    finish() {
      return {
        avgCostCents: avg(costSum, counted),
        freeShippingShare: counted > 0 ? Math.round((free / counted) * 100) : 0,
        totalCostCents: costSum,
      };
    },
  };
}

function fraudAggregator(snapshot: RuleSetSnapshot): AggregateAccumulator {
  const counts = { ALLOW: 0, CHALLENGE: 0, REVIEW: 0, BLOCK: 0 };
  let scoreSum = 0;
  let counted = 0;
  return {
    add(_context, decision) {
      const score = Math.max(0, num(decision.riskScore) ?? 0);
      // Same derivation as the storefront: a rule may pin the decision,
      // otherwise the thresholds turn the score into one.
      const pinned = decision.decision;
      const thresholds = readThresholds({
        thresholds: decision.thresholds ?? (snapshot.defaultDecision as Record<string, unknown>).thresholds,
      });
      const verdict =
        pinned === "ALLOW" || pinned === "CHALLENGE" || pinned === "REVIEW" || pinned === "BLOCK"
          ? pinned
          : decisionFromScore(score, thresholds);
      counts[verdict] += 1;
      scoreSum += score;
      counted += 1;
    },
    finish() {
      return {
        allowCount: counts.ALLOW,
        challengeCount: counts.CHALLENGE,
        reviewCount: counts.REVIEW,
        blockCount: counts.BLOCK,
        blockedShare: counted > 0 ? Math.round((counts.BLOCK / counted) * 100) : 0,
        avgRiskScore: avg(scoreSum, counted),
      };
    },
  };
}

function availabilityAggregator(): AggregateAccumulator {
  let blocked = 0;
  let hidden = 0;
  let limited = 0;
  let counted = 0;
  return {
    add(_context, decision) {
      counted += 1;
      if (decision.available === false) blocked += 1;
      if (decision.hidden === true) hidden += 1;
      if (num(decision.maxQuantityPerOrder) !== null) limited += 1;
    },
    finish() {
      return {
        blockedCount: blocked,
        hiddenCount: hidden,
        limitedCount: limited,
        blockedShare: counted > 0 ? Math.round((blocked / counted) * 100) : 0,
      };
    },
  };
}

function loyaltyAggregator(): AggregateAccumulator {
  let bonusSum = 0;
  let multiplierSum = 0;
  let pointsSum = 0;
  let basePointsSum = 0;
  let boosted = 0;
  let counted = 0;
  return {
    add(context, decision) {
      counted += 1;
      const multiplier = Math.max(0, num(decision.pointsMultiplier) ?? 1);
      const bonus = Math.max(0, num(decision.bonusPoints) ?? 0);
      bonusSum += bonus;
      multiplierSum += multiplier;

      // Same formula as the storefront.
      const basePoints = basePointsFor(
        contextNumber(context, ["cart", "subtotalCents"]) ?? 0,
      );
      const points = Math.round(basePoints * multiplier) + Math.floor(bonus);
      basePointsSum += basePoints;
      pointsSum += points;
      if (points > basePoints) boosted += 1;
    },
    finish() {
      return {
        totalPointsAwarded: pointsSum,
        // What the rules added over the base: the campaign's cost.
        extraPointsFromRules: pointsSum - basePointsSum,
        avgPointsPerEvaluation: avg(pointsSum, counted),
        boostedShare: counted > 0 ? Math.round((boosted / counted) * 100) : 0,
        totalBonusPoints: bonusSum,
        avgPointsMultiplierX100:
          counted > 0 ? Math.round((multiplierSum / counted) * 100) : 100,
      };
    },
  };
}

function themeAggregator(): AggregateAccumulator {
  let themed = 0;
  let withBanner = 0;
  let customLayout = 0;
  let counted = 0;
  return {
    add(_context, decision) {
      counted += 1;
      const tokens =
        typeof decision.tokens === "object" && decision.tokens !== null
          ? Object.keys(decision.tokens as Record<string, unknown>).length
          : 0;
      if (tokens > 0) themed += 1;
      if (typeof decision.banner === "string" && decision.banner.trim() !== "") {
        withBanner += 1;
      }
      if (
        typeof decision.layoutVariant === "string" &&
        decision.layoutVariant !== "default"
      ) {
        customLayout += 1;
      }
    },
    finish() {
      const share = (n: number) =>
        counted > 0 ? Math.round((n / counted) * 100) : 0;
      return {
        themedShare: share(themed),
        bannerShare: share(withBanner),
        customLayoutShare: share(customLayout),
      };
    },
  };
}

function aggregatorFor(snapshot: RuleSetSnapshot): AggregateAccumulator {
  switch (snapshot.category) {
    case "PRICING":
      return pricingAggregator();
    case "SHIPPING":
      return shippingAggregator();
    case "FRAUD":
      return fraudAggregator(snapshot);
    case "AVAILABILITY":
      return availabilityAggregator();
    case "LOYALTY":
      return loyaltyAggregator();
    case "THEME":
      return themeAggregator();
    default:
      return { add() {}, finish: () => ({}) };
  }
}

/** Deterministic: the generated traceIds do not reach the result. */
export function simulateSnapshot(
  snapshot: RuleSetSnapshot,
  events: SimulationEvent[],
): SnapshotMetrics {
  const perRule: Record<string, RuleSimulationStats> = {};
  for (const rule of snapshot.rules) {
    perRule[rule.key] = { matched: 0, applied: 0 };
  }

  const aggregator = aggregatorFor(snapshot);
  let matchedEvaluations = 0;
  let usedDefault = 0;

  for (const event of events) {
    const result = evaluateRuleSet(snapshot, event.context as EvaluationContext);

    for (const trace of result.trace) {
      const stats = perRule[trace.ruleKey];
      if (stats && trace.matched) stats.matched += 1;
    }
    for (const key of result.matchedRules) {
      const stats = perRule[key];
      if (stats) stats.applied += 1;
    }

    if (result.usedDefault) usedDefault += 1;
    else matchedEvaluations += 1;

    aggregator.add(event.context, result.decision);
  }

  return {
    evaluations: events.length,
    matchedEvaluations,
    usedDefault,
    perRule,
    aggregates: aggregator.finish(events.length),
  };
}

/** The active version against the candidate, over the same events. */
export interface SimulationComparison {
  events: number;
  /** Null on a first publish, when there is no active version. */
  active: SnapshotMetrics | null;
  candidate: SnapshotMetrics;
  /** Aggregate deltas: key -> candidate minus active. */
  aggregateDeltas: Record<string, number>;
}

export function compareSnapshots(
  active: RuleSetSnapshot | null,
  candidate: RuleSetSnapshot,
  events: SimulationEvent[],
): SimulationComparison {
  const candidateMetrics = simulateSnapshot(candidate, events);
  const activeMetrics = active ? simulateSnapshot(active, events) : null;

  const aggregateDeltas: Record<string, number> = {};
  if (activeMetrics) {
    const keys = new Set([
      ...Object.keys(activeMetrics.aggregates),
      ...Object.keys(candidateMetrics.aggregates),
    ]);
    for (const key of keys) {
      aggregateDeltas[key] =
        (candidateMetrics.aggregates[key] ?? 0) - (activeMetrics.aggregates[key] ?? 0);
    }
  }

  return {
    events: events.length,
    active: activeMetrics,
    candidate: candidateMetrics,
    aggregateDeltas,
  };
}
