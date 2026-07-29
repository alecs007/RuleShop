import type { ConflictStrategy, DecisionCategory } from "@/lib/engine";

export const CATEGORY_LABELS: Record<DecisionCategory, string> = {
  PRICING: "Preturi si reduceri",
  SHIPPING: "Livrare",
  FRAUD: "Antifrauda",
  AVAILABILITY: "Disponibilitate",
  LOYALTY: "Loialitate",
  THEME: "Tema si personalizare",
};

export const STRATEGY_LABELS: Record<ConflictStrategy, string> = {
  PRIORITY_FIRST_MATCH: "Prima regula (dupa prioritate)",
  PRIORITY_ALL_MATCHES: "Toate regulile potrivite",
  MOST_SPECIFIC: "Cea mai specifica regula",
  BEST_FOR_CUSTOMER: "Cea mai avantajoasa pentru client",
};

interface CategoryDefaults {
  conflictStrategy: ConflictStrategy;
  defaultDecision: Record<string, unknown>;
}

/** Setari initiale la crearea unui ruleset (fail-safe rezonabile). */
export const CATEGORY_DEFAULTS: Record<DecisionCategory, CategoryDefaults> = {
  PRICING: {
    conflictStrategy: "BEST_FOR_CUSTOMER",
    defaultDecision: {},
  },
  SHIPPING: {
    conflictStrategy: "BEST_FOR_CUSTOMER",
    defaultDecision: { costCents: 1999, freeShipping: false },
  },
  FRAUD: {
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    defaultDecision: { riskScore: 0, decision: "ALLOW", signals: [] },
  },
  AVAILABILITY: {
    conflictStrategy: "PRIORITY_FIRST_MATCH",
    defaultDecision: { available: true, hidden: false },
  },
  LOYALTY: {
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    defaultDecision: { pointsMultiplier: 1, bonusPoints: 0, benefits: [] },
  },
  THEME: {
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    defaultDecision: { tokens: {}, banner: null, layoutVariant: "default" },
  },
};
