/** Mirrors the DecisionCategory enum in the Prisma schema. */
export const DECISION_CATEGORIES = [
  "PRICING",
  "SHIPPING",
  "FRAUD",
  "AVAILABILITY",
  "LOYALTY",
  "THEME",
] as const;

export type DecisionCategory = (typeof DECISION_CATEGORIES)[number];

export const CONFLICT_STRATEGIES = [
  "PRIORITY_FIRST_MATCH",
  "PRIORITY_ALL_MATCHES",
  "MOST_SPECIFIC",
  "BEST_FOR_CUSTOMER",
] as const;

export type ConflictStrategy = (typeof CONFLICT_STRATEGIES)[number];

export type GroupOperator = "AND" | "OR" | "NOT";

export interface ConditionLeaf {
  type: "condition";
  /** Dot-notation path into the evaluation context, e.g. "cart.totalCents". */
  fact: string;
  operator: string;
  /** Absent for unary operators (exists, isTrue, ...). */
  value?: unknown;
}

export interface ConditionGroup {
  type: "group";
  op: GroupOperator;
  children: ConditionNode[];
}

export type ConditionNode = ConditionLeaf | ConditionGroup;

export interface RuleAction {
  type: string;
  params: Record<string, unknown>;
}

export interface EngineRule {
  key: string;
  name: string;
  /** Higher value wins. */
  priority: number;
  enabled: boolean;
  conditions: ConditionNode;
  actions: RuleAction[];
  /** Validity window (ISO 8601), for time-limited campaigns. */
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  metadata?: Record<string, unknown>;
}

/** Exactly what is stored in `RuleVersion.snapshot`. The engine evaluates only these. */
export interface RuleSetSnapshot {
  key: string;
  category: DecisionCategory;
  version: number;
  conflictStrategy: ConflictStrategy;
  /** Fail-safe decision when nothing matches or the kill switch is on. */
  defaultDecision: Record<string, unknown>;
  rules: EngineRule[];
}

/**
 * Facts available to rules, grouped by namespace: customer.*, cart.*,
 * product.*, session.*, order.*, store.*. Any resolvable path is a valid fact.
 */
export interface EvaluationContext {
  /** Evaluation time (ISO). Defaults to now; injectable for simulations. */
  now?: string;
  [namespace: string]: unknown;
}

export interface LeafTrace {
  type: "condition";
  fact: string;
  operator: string;
  expected: unknown;
  /** The value actually found in the context. */
  actual: unknown;
  result: boolean;
}

export interface GroupTrace {
  type: "group";
  op: GroupOperator;
  result: boolean;
  children: ConditionTrace[];
}

export type ConditionTrace = LeafTrace | GroupTrace;

export interface RuleTrace {
  ruleKey: string;
  ruleName: string;
  priority: number;
  /** false if the rule was skipped (disabled / outside its window). */
  evaluated: boolean;
  skippedReason?: "disabled" | "not-yet-effective" | "expired";
  matched: boolean;
  conditionTrace?: ConditionTrace;
  /** Actions that actually reached the decision, after conflict resolution. */
  appliedActions: RuleAction[];
}

export interface EvaluationResult<TDecision = Record<string, unknown>> {
  decision: TDecision;
  category: DecisionCategory;
  rulesetKey: string;
  rulesetVersion: number;
  matchedRules: string[];
  conflictStrategy: ConflictStrategy;
  traceId: string;
  evaluatedAt: string;
  trace: RuleTrace[];
  /** true if `defaultDecision` was used (no match / kill switch). */
  usedDefault: boolean;
}

export class EngineError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNKNOWN_OPERATOR"
      | "UNKNOWN_ACTION"
      | "INVALID_SNAPSHOT"
      | "INVALID_CONDITION",
  ) {
    super(message);
    this.name = "EngineError";
  }
}
