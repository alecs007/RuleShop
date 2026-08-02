import type { ConflictStrategy, DecisionCategory } from "@ruleshop/rule-engine";

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

/** Initial settings for a new ruleset: sensible fail-safes. */
export const CATEGORY_DEFAULTS: Record<DecisionCategory, CategoryDefaults> = {
  PRICING: {
    conflictStrategy: "BEST_FOR_CUSTOMER",
    defaultDecision: {},
  },
  SHIPPING: {
    // The shipping decision has independent fields, so a single-winner
    // strategy would silently drop the availability rules whenever a cost rule
    // also matched. All matching rules apply; the highest priority wins the
    // fields they overlap on.
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    // Empty on purpose: with no rules each method keeps its list price.
    defaultDecision: {},
  },
  FRAUD: {
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    // No `decision` key: its presence means a rule pinned the decision.
    defaultDecision: {
      riskScore: 0,
      signals: [],
      thresholds: { challenge: 30, review: 55, block: 80 },
    },
  },
  AVAILABILITY: {
    // Same as SHIPPING: independent fields, so all matching rules apply.
    conflictStrategy: "PRIORITY_ALL_MATCHES",
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
