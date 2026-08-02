import { applyActions, Decision } from "./actions";
import { countConditionLeaves, evaluateCondition } from "./evaluate";
import {
  ConflictStrategy,
  EngineRule,
  EvaluationContext,
  EvaluationResult,
  RuleSetSnapshot,
  RuleTrace,
} from "./types";

export interface EvaluateOptions {
  /** Propagated from the request when there is one; generated otherwise. */
  traceId?: string;
  /** Returns `defaultDecision` without evaluating anything. */
  killSwitch?: boolean;
  killedRuleKeys?: string[];
}

function generateTraceId(): string {
  return `eval-${Math.random().toString(16).slice(2, 10)}`;
}

interface MatchedRule {
  rule: EngineRule;
  trace: RuleTrace;
}

/** Scores a single rule's decision: higher means better for the customer. */
function customerBenefitScore(category: string, decision: Decision): number {
  switch (category) {
    case "PRICING": {
      const pct = typeof decision.discountPercent === "number" ? decision.discountPercent : 0;
      const fixed = typeof decision.discountFixedCents === "number" ? decision.discountFixedCents : 0;
      // The percentage dominates; the fixed discount breaks ties.
      return pct * 1000 + fixed;
    }
    case "SHIPPING": {
      if (decision.freeShipping === true) return Number.MAX_SAFE_INTEGER;
      const cost = typeof decision.costCents === "number" ? decision.costCents : Number.MAX_SAFE_INTEGER;
      return -cost;
    }
    case "LOYALTY": {
      const mult = typeof decision.pointsMultiplier === "number" ? decision.pointsMultiplier : 1;
      const bonus = typeof decision.bonusPoints === "number" ? decision.bonusPoints : 0;
      return mult * 1000 + bonus;
    }
    default:
      // FRAUD / AVAILABILITY / THEME have no "better for the customer":
      // equal scores fall back to priority.
      return 0;
  }
}

function byPriorityDesc(a: EngineRule, b: EngineRule): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return a.key.localeCompare(b.key);
}

function isWithinEffectiveWindow(
  rule: EngineRule,
  nowMs: number,
): { ok: boolean; reason?: "not-yet-effective" | "expired" } {
  if (rule.effectiveFrom) {
    const from = Date.parse(rule.effectiveFrom);
    if (!Number.isNaN(from) && nowMs < from) {
      return { ok: false, reason: "not-yet-effective" };
    }
  }
  if (rule.effectiveTo) {
    const to = Date.parse(rule.effectiveTo);
    if (!Number.isNaN(to) && nowMs > to) {
      return { ok: false, reason: "expired" };
    }
  }
  return { ok: true };
}

/** The rules whose actions apply, in the order they should be applied. */
function resolveConflicts(
  matched: MatchedRule[],
  snapshot: RuleSetSnapshot,
): MatchedRule[] {
  if (matched.length === 0) return [];

  switch (snapshot.conflictStrategy) {
    case "PRIORITY_FIRST_MATCH":
      return matched.slice(0, 1);

    case "PRIORITY_ALL_MATCHES":
      // Lowest priority first, so the highest one has the last word.
      return [...matched].reverse();

    case "MOST_SPECIFIC": {
      const scored = matched.map((m) => ({
        m,
        leaves: countConditionLeaves(m.rule.conditions),
      }));
      scored.sort(
        (a, b) =>
          b.leaves - a.leaves || b.m.rule.priority - a.m.rule.priority ||
          a.m.rule.key.localeCompare(b.m.rule.key),
      );
      const first = scored[0];
      return first ? [first.m] : [];
    }

    case "BEST_FOR_CUSTOMER": {
      const scored = matched.map((m) => {
        const soloDecision = applyActions(
          { ...snapshot.defaultDecision },
          m.rule.actions,
          snapshot.category,
        );
        return { m, score: customerBenefitScore(snapshot.category, soloDecision) };
      });
      scored.sort(
        (a, b) =>
          b.score - a.score || b.m.rule.priority - a.m.rule.priority ||
          a.m.rule.key.localeCompare(b.m.rule.key),
      );
      const best = scored[0];
      return best ? [best.m] : [];
    }
  }
}

/** Pure apart from the generated traceId: same snapshot + context, same decision. */
export function evaluateRuleSet(
  snapshot: RuleSetSnapshot,
  context: EvaluationContext,
  options: EvaluateOptions = {},
): EvaluationResult {
  const traceId = options.traceId ?? generateTraceId();
  const evaluatedAt = context.now ?? new Date().toISOString();
  const nowMs = Date.parse(evaluatedAt);

  const base: Omit<EvaluationResult, "decision" | "matchedRules" | "trace" | "usedDefault"> = {
    category: snapshot.category,
    rulesetKey: snapshot.key,
    rulesetVersion: snapshot.version,
    conflictStrategy: snapshot.conflictStrategy,
    traceId,
    evaluatedAt,
  };

  if (options.killSwitch) {
    return {
      ...base,
      decision: { ...snapshot.defaultDecision },
      matchedRules: [],
      trace: [],
      usedDefault: true,
    };
  }

  const killed = new Set(options.killedRuleKeys ?? []);
  const sorted = [...snapshot.rules].sort(byPriorityDesc);

  const traces: RuleTrace[] = [];
  const matched: MatchedRule[] = [];

  for (const rule of sorted) {
    const traceBase = {
      ruleKey: rule.key,
      ruleName: rule.name,
      priority: rule.priority,
      appliedActions: [] as RuleTrace["appliedActions"],
    };

    if (!rule.enabled || killed.has(rule.key)) {
      traces.push({ ...traceBase, evaluated: false, skippedReason: "disabled", matched: false });
      continue;
    }
    const window = isWithinEffectiveWindow(rule, nowMs);
    if (!window.ok) {
      traces.push({ ...traceBase, evaluated: false, skippedReason: window.reason, matched: false });
      continue;
    }

    const evaluation = evaluateCondition(rule.conditions, context);
    const trace: RuleTrace = {
      ...traceBase,
      evaluated: true,
      matched: evaluation.result,
      conditionTrace: evaluation.trace,
    };
    traces.push(trace);
    if (evaluation.result) matched.push({ rule, trace });
  }

  const winners = resolveConflicts(matched, snapshot);

  let decision: Decision = { ...snapshot.defaultDecision };
  for (const winner of winners) {
    decision = applyActions(decision, winner.rule.actions, snapshot.category);
    winner.trace.appliedActions = winner.rule.actions;
  }

  return {
    ...base,
    decision,
    matchedRules: winners.map((w) => w.rule.key),
    trace: traces,
    usedDefault: winners.length === 0,
  };
}

export type { ConflictStrategy };
