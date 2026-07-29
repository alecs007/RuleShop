import type { ConflictStrategy, DecisionCategory } from "@/lib/engine";

export const CATEGORY_LABELS: Record<DecisionCategory, string> = {
  PRICING: "Prețuri și reduceri",
  SHIPPING: "Livrare",
  FRAUD: "Antifraudă",
  AVAILABILITY: "Disponibilitate",
  LOYALTY: "Loialitate",
  THEME: "Temă și personalizare",
};

export const STRATEGY_LABELS: Record<ConflictStrategy, string> = {
  PRIORITY_FIRST_MATCH: "Prima regulă (după prioritate)",
  PRIORITY_ALL_MATCHES: "Toate regulile potrivite",
  MOST_SPECIFIC: "Cea mai specifică regulă",
  BEST_FOR_CUSTOMER: "Cea mai avantajoasă pentru client",
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
