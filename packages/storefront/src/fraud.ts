/**
 * Fraud scoring. Rules add risk score and flag signals, and thresholds turn the
 * accumulated score into a decision — unless a rule pins the decision outright
 * (SET_FRAUD_DECISION), which is how allowlists and hard blocks are written.
 */
import { evaluateRuleSet, type RuleSetSnapshot, type RuleTrace } from "@ruleshop/rule-engine";

export const FRAUD_DECISIONS = ["ALLOW", "CHALLENGE", "REVIEW", "BLOCK"] as const;
export type FraudDecisionValue = (typeof FRAUD_DECISIONS)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevelValue = (typeof RISK_LEVELS)[number];

/** Score -> decision thresholds, versioned along with the ruleset. */
export interface RiskThresholds {
  challenge: number;
  review: number;
  block: number;
}

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  challenge: 30,
  review: 55,
  block: 80,
};

const LEVEL_THRESHOLDS: { level: RiskLevelValue; from: number }[] = [
  { level: "CRITICAL", from: 75 },
  { level: "HIGH", from: 50 },
  { level: "MEDIUM", from: 25 },
  { level: "LOW", from: 0 },
];

function clampScore(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1000, Math.round(value)))
    : 0;
}

/** Thresholds must be increasing; anything else falls back to the defaults. */
export function readThresholds(defaultDecision: unknown): RiskThresholds {
  const raw =
    typeof defaultDecision === "object" && defaultDecision !== null
      ? (defaultDecision as Record<string, unknown>).thresholds
      : undefined;
  if (typeof raw !== "object" || raw === null) return DEFAULT_THRESHOLDS;

  const t = raw as Record<string, unknown>;
  const challenge = clampScore(t.challenge);
  const review = clampScore(t.review);
  const block = clampScore(t.block);
  const ordered = challenge > 0 && challenge < review && review < block;
  return ordered ? { challenge, review, block } : DEFAULT_THRESHOLDS;
}

export function riskLevelOf(score: number): RiskLevelValue {
  const found = LEVEL_THRESHOLDS.find((l) => score >= l.from);
  return found?.level ?? "LOW";
}

const DECISION_LEVELS: Record<FraudDecisionValue, RiskLevelValue> = {
  ALLOW: "LOW",
  CHALLENGE: "MEDIUM",
  REVIEW: "HIGH",
  BLOCK: "CRITICAL",
};

/** A rule that blocks without adding score must still report as critical. */
export function strongerRiskLevel(
  a: RiskLevelValue,
  b: RiskLevelValue,
): RiskLevelValue {
  return RISK_LEVELS.indexOf(a) >= RISK_LEVELS.indexOf(b) ? a : b;
}

export function decisionFromScore(
  score: number,
  thresholds: RiskThresholds,
): FraudDecisionValue {
  if (score >= thresholds.block) return "BLOCK";
  if (score >= thresholds.review) return "REVIEW";
  if (score >= thresholds.challenge) return "CHALLENGE";
  return "ALLOW";
}

function isFraudDecision(value: unknown): value is FraudDecisionValue {
  return (
    typeof value === "string" &&
    (FRAUD_DECISIONS as readonly string[]).includes(value)
  );
}

export interface FraudCartFacts {
  subtotalCents: number;
  itemCount: number;
  categories: string[];
  weightGrams: number;
}

/** Session signals computed by the app, never declared by the client. */
export interface FraudSessionFacts {
  isGuest: boolean;
  isAuthenticated: boolean;
  /** Derived from the IP, when the infrastructure provides it. */
  ipCountry: string | null;
  ordersLastHour: number;
  ordersLastDay: number;
  /** Earlier blocks/reviews on the same session or email. */
  priorBlocks: number;
  priorReviews: number;
  /** 0 for guests. */
  accountAgeDays: number;
}

export interface FraudOrderFacts {
  totalCents: number;
  shippingCents: number;
  shippingCountry: string;
  billingCountry: string;
  addressMismatch: boolean;
  paymentMethod: string;
  itemCount: number;
}

export interface FraudFacts {
  cart: FraudCartFacts;
  customer: Record<string, unknown>;
  session: FraudSessionFacts;
  order: FraudOrderFacts;
}

export interface FraudAssessment {
  riskScore: number;
  riskLevel: RiskLevelValue;
  decision: FraudDecisionValue;
  /** Where the decision came from: pinned by a rule, derived, or default. */
  decisionSource: "rule" | "score" | "default";
  flaggedSignals: string[];
  matchedRules: string[];
  rulesetVersion: number | null;
  traceId: string | null;
  thresholds: RiskThresholds;
  /** true when no ruleset is published or the kill switch is on. */
  usedDefaults: boolean;
  trace: RuleTrace[];
}

export interface AssessInput {
  /** The published snapshot; null means nothing has been published. */
  snapshot: RuleSetSnapshot | null;
  killSwitch?: boolean;
  facts: FraudFacts;
  /** Fixed instant, for reproducible simulations. */
  now?: string;
}

/**
 * Fail-safe: with no published ruleset, or with the kill switch on, the order
 * passes — turning the rules off must not shut the storefront down.
 */
export function assessFraud(input: AssessInput): FraudAssessment {
  const { snapshot, facts } = input;

  if (!snapshot || input.killSwitch) {
    return {
      riskScore: 0,
      riskLevel: "LOW",
      decision: "ALLOW",
      decisionSource: "default",
      flaggedSignals: [],
      matchedRules: [],
      rulesetVersion: snapshot?.version ?? null,
      traceId: null,
      thresholds: readThresholds(snapshot?.defaultDecision),
      usedDefaults: true,
      trace: [],
    };
  }

  const result = evaluateRuleSet(snapshot, {
    ...(input.now ? { now: input.now } : {}),
    cart: facts.cart,
    customer: facts.customer,
    session: facts.session,
    order: facts.order,
  });

  const thresholds = readThresholds(snapshot.defaultDecision);
  const riskScore = clampScore(result.decision.riskScore);

  // Read from the trace, not from the decision: an older `defaultDecision`
  // may already carry the key and would block deriving from the score.
  const pinnedByRule = result.trace.some(
    (rule) =>
      rule.matched &&
      rule.appliedActions.some((action) => action.type === "SET_FRAUD_DECISION"),
  );
  const pinned = result.decision.decision;
  const decision =
    pinnedByRule && isFraudDecision(pinned)
      ? pinned
      : decisionFromScore(riskScore, thresholds);

  const flaggedSignals = Array.isArray(result.decision.signals)
    ? result.decision.signals.filter((s): s is string => typeof s === "string")
    : [];

  return {
    riskScore,
    riskLevel: strongerRiskLevel(
      riskLevelOf(riskScore),
      DECISION_LEVELS[decision],
    ),
    decision,
    decisionSource:
      pinnedByRule && isFraudDecision(pinned)
        ? "rule"
        : result.matchedRules.length > 0
          ? "score"
          : "default",
    flaggedSignals,
    matchedRules: result.matchedRules,
    rulesetVersion: result.rulesetVersion,
    traceId: result.traceId,
    thresholds,
    usedDefaults: false,
    trace: result.trace,
  };
}

export const DECISION_LABELS: Record<FraudDecisionValue, string> = {
  ALLOW: "Permisă",
  CHALLENGE: "Verificare suplimentară",
  REVIEW: "Trimisă la verificare manuală",
  BLOCK: "Blocată",
};

export const RISK_LEVEL_LABELS: Record<RiskLevelValue, string> = {
  LOW: "Risc scăzut",
  MEDIUM: "Risc mediu",
  HIGH: "Risc ridicat",
  CRITICAL: "Risc critic",
};

export function explainAssessment(assessment: FraudAssessment): string {
  if (assessment.usedDefaults) {
    return "Nicio versiune activă de reguli antifraudă — comanda a trecut fără verificări.";
  }
  const parts: string[] = [`scor de risc ${assessment.riskScore}`];
  if (assessment.decisionSource === "rule") {
    parts.push("decizie fixată explicit de o regulă");
  } else if (assessment.decisionSource === "score") {
    parts.push(
      `prag depășit (verificare ${assessment.thresholds.challenge}, manual ${assessment.thresholds.review}, blocare ${assessment.thresholds.block})`,
    );
  } else {
    parts.push("nicio regulă nu s-a potrivit");
  }
  if (assessment.flaggedSignals.length > 0) {
    parts.push(`semnale: ${assessment.flaggedSignals.join(", ")}`);
  }
  return `${DECISION_LABELS[assessment.decision]} — ${parts.join("; ")}.`;
}
