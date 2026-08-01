/**
 * Tipurile nucleului rule engine.
 *
 * Motorul este pur si detasat de orice infrastructura: primeste un snapshot
 * imutabil de ruleset (asa cum e publicat in RuleVersion.snapshot) si un
 * context de fapte, si intoarce o decizie + explicatia completa a modului in
 * care a fost obtinuta. Nu atinge baza de date, nu executa cod arbitrar.
 */

// ---------------------------------------------------------------------------
// Categorii de decizie (oglindesc enum-ul DecisionCategory din Prisma)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Conditii — arbore AND / OR / NOT cu frunze (fact, operator, value)
// ---------------------------------------------------------------------------

export type GroupOperator = "AND" | "OR" | "NOT";

export interface ConditionLeaf {
  type: "condition";
  /** Cale dot-notation in contextul de evaluare, ex: "cart.totalCents". */
  fact: string;
  operator: string;
  /** Valoarea de comparatie; lipseste la operatorii unari (exists, isTrue...). */
  value?: unknown;
}

export interface ConditionGroup {
  type: "group";
  op: GroupOperator;
  children: ConditionNode[];
}

export type ConditionNode = ConditionLeaf | ConditionGroup;

// ---------------------------------------------------------------------------
// Actiuni
// ---------------------------------------------------------------------------

export interface RuleAction {
  type: string;
  params: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Reguli si snapshot-uri
// ---------------------------------------------------------------------------

export interface EngineRule {
  key: string;
  name: string;
  /** Valoare mai mare = prioritate mai mare. */
  priority: number;
  enabled: boolean;
  conditions: ConditionNode;
  actions: RuleAction[];
  /** Fereastra de valabilitate (ISO 8601), ex. campanii limitate in timp. */
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Snapshot imutabil al unui ruleset — exact structura stocata in
 * RuleVersion.snapshot la publicare. Motorul evalueaza doar snapshot-uri.
 */
export interface RuleSetSnapshot {
  key: string;
  category: DecisionCategory;
  version: number;
  conflictStrategy: ConflictStrategy;
  /** Decizia fail-safe cand nimic nu se potriveste sau kill switch e activ. */
  defaultDecision: Record<string, unknown>;
  rules: EngineRule[];
}

// ---------------------------------------------------------------------------
// Contextul de evaluare (faptele)
// ---------------------------------------------------------------------------

/**
 * Faptele disponibile regulilor, organizate pe namespace-uri:
 *   customer.* , cart.* , product.* , session.* , order.* , store.*
 * Motorul nu impune o forma fixa — orice cale rezolvabila e un fact valid —
 * dar API-ul de decisioning construieste contextul canonic din aceste surse.
 */
export interface EvaluationContext {
  /** Momentul evaluarii (ISO). Implicit: acum. Injectabil pentru simulari. */
  now?: string;
  [namespace: string]: unknown;
}

// ---------------------------------------------------------------------------
// Rezultat si explicatie
// ---------------------------------------------------------------------------

/** Explicatia evaluarii unei frunze de conditie. */
export interface LeafTrace {
  type: "condition";
  fact: string;
  operator: string;
  expected: unknown;
  /** Valoarea efectiv gasita in context. */
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

/** Ce s-a intamplat cu o regula in timpul evaluarii. */
export interface RuleTrace {
  ruleKey: string;
  ruleName: string;
  priority: number;
  /** false daca regula a fost sarita (disabled / in afara ferestrei). */
  evaluated: boolean;
  skippedReason?: "disabled" | "not-yet-effective" | "expired";
  matched: boolean;
  conditionTrace?: ConditionTrace;
  /** Actiunile aplicate efectiv asupra deciziei (dupa strategia de conflict). */
  appliedActions: RuleAction[];
}

export interface EvaluationResult<TDecision = Record<string, unknown>> {
  decision: TDecision;
  category: DecisionCategory;
  rulesetKey: string;
  rulesetVersion: number;
  /** Cheile regulilor ale caror actiuni au contribuit la decizia finala. */
  matchedRules: string[];
  conflictStrategy: ConflictStrategy;
  traceId: string;
  evaluatedAt: string;
  /** Explicatia completa, redabila in UI si stocabila in istoric. */
  trace: RuleTrace[];
  /** true daca s-a folosit defaultDecision (nicio potrivire / kill switch). */
  usedDefault: boolean;
}

// ---------------------------------------------------------------------------
// Erori
// ---------------------------------------------------------------------------

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
