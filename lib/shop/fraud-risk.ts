/**
 * Evaluarea riscului de fraudă — nucleul PUR (fara DB, fara sesiune), ca sa
 * poata fi folosit identic la checkout, de testerul din control plane si de
 * teste.
 *
 * Modelul deciziei:
 *  - regulile ADUNA scor de risc (ADD_RISK_SCORE) si marcheaza semnale
 *    (FLAG_SIGNAL); scorul acumulat se traduce in decizie prin praguri;
 *  - o regula poate FIXA decizia (SET_FRAUD_DECISION) — atunci pragurile nu mai
 *    conteaza. Asa se pot scrie si liste albe („client VIP => ALLOW") si blocari
 *    dure („tara interzisa => BLOCK"), fara sa depinda de scor.
 *
 * Faptul ca o regula a fixat decizia se stabileste din trace (ce actiuni s-au
 * aplicat efectiv), nu din prezenta cheii `decision` in rezultat: altfel un
 * `defaultDecision` mai vechi, care conține deja cheia, ar bloca deducerea din
 * scor.
 */
import { evaluateRuleSet, type RuleSetSnapshot, type RuleTrace } from "@/lib/engine";

export const FRAUD_DECISIONS = ["ALLOW", "CHALLENGE", "REVIEW", "BLOCK"] as const;
export type FraudDecisionValue = (typeof FRAUD_DECISIONS)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevelValue = (typeof RISK_LEVELS)[number];

/** Pragurile scor -> decizie. Versionate impreuna cu rulesetul. */
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

/** Pragurile scor -> nivel de risc (doar pentru clasificare/afisare). */
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

/**
 * Citeste pragurile din `defaultDecision.thresholds`, cu fallback pe cele
 * implicite. Valorile trebuie crescatoare; altfel se ignora (fail-safe).
 */
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

/** Severitatea implicita a unei decizii, cand ea nu vine din scor. */
const DECISION_LEVELS: Record<FraudDecisionValue, RiskLevelValue> = {
  ALLOW: "LOW",
  CHALLENGE: "MEDIUM",
  REVIEW: "HIGH",
  BLOCK: "CRITICAL",
};

/**
 * Nivelul mai sever dintre doua. O regula care blocheaza fara sa adune scor
 * („tara interzisa => BLOCK") trebuie totusi raportata ca risc critic.
 */
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

// ---------------------------------------------------------------------------
// Faptele de intrare
// ---------------------------------------------------------------------------

/** Faptele despre cos, la fel ca la livrare. */
export interface FraudCartFacts {
  subtotalCents: number;
  itemCount: number;
  categories: string[];
  weightGrams: number;
}

/**
 * Semnalele de sesiune/istoric calculate de aplicatie (nu declarate de client):
 * viteza comenzilor, incidente anterioare, vechimea contului.
 */
export interface FraudSessionFacts {
  isGuest: boolean;
  isAuthenticated: boolean;
  /** Tara derivata din IP, daca infrastructura o furnizeaza. */
  ipCountry: string | null;
  ordersLastHour: number;
  ordersLastDay: number;
  /** Comenzi blocate/trimise la verificare anterior, pe aceeasi sesiune/email. */
  priorBlocks: number;
  priorReviews: number;
  /** Vechimea contului in zile; 0 pentru vizitatori. */
  accountAgeDays: number;
}

/** Faptele comenzii care se plaseaza. */
export interface FraudOrderFacts {
  totalCents: number;
  shippingCents: number;
  shippingCountry: string;
  billingCountry: string;
  /** Adresa de livrare difera de cea de facturare. */
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

// ---------------------------------------------------------------------------
// Rezultatul
// ---------------------------------------------------------------------------

export interface FraudAssessment {
  riskScore: number;
  riskLevel: RiskLevelValue;
  decision: FraudDecisionValue;
  /** De unde vine decizia: fixata de o regula, dedusa din scor, sau implicita. */
  decisionSource: "rule" | "score" | "default";
  /** Semnalele marcate de reguli (FLAG_SIGNAL). */
  flaggedSignals: string[];
  matchedRules: string[];
  rulesetVersion: number | null;
  traceId: string | null;
  thresholds: RiskThresholds;
  /** true cand nu exista ruleset publicat sau kill switch-ul e activ. */
  usedDefaults: boolean;
  /** Explicatia completa a evaluarii (pentru istoric si interfata). */
  trace: RuleTrace[];
}

export interface AssessInput {
  /** Snapshotul publicat; null => nu s-a publicat nimic. */
  snapshot: RuleSetSnapshot | null;
  killSwitch?: boolean;
  facts: FraudFacts;
  /** Moment fix, pentru simulari reproductibile. */
  now?: string;
}

/**
 * Evalueaza rulesetul FRAUD pentru o tentativa de comanda.
 *
 * Fail-safe: fara ruleset publicat sau cu kill switch activ, comanda trece
 * (ALLOW, scor 0) — oprirea regulilor nu trebuie sa blocheze magazinul.
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

  // O regula a fixat decizia doar daca s-a aplicat efectiv SET_FRAUD_DECISION.
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

// ---------------------------------------------------------------------------
// Etichete pentru interfata
// ---------------------------------------------------------------------------

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

/** Explicatia deciziei, in limbaj natural, pentru admin si pentru istoric. */
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
