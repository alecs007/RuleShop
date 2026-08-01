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

/** Setari initiale la crearea unui ruleset (fail-safe rezonabile). */
export const CATEGORY_DEFAULTS: Record<DecisionCategory, CategoryDefaults> = {
  PRICING: {
    conflictStrategy: "BEST_FOR_CUSTOMER",
    defaultDecision: {},
  },
  SHIPPING: {
    // Decizia de livrare are campuri independente (cost, disponibilitate,
    // estimare), deci o strategie cu un singur castigator ar arunca in silentiu
    // regulile de disponibilitate atunci cand exista si una de cost. Toate
    // regulile potrivite se aplica; prioritatea mai mare are ultimul cuvant pe
    // campurile suprascrise. Administratorul poate schimba strategia oricand.
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    // Gol intentionat: fara reguli, fiecare metoda isi pastreaza costul de
    // lista din setarile magazinului (fail-safe la kill switch).
    defaultDecision: {},
  },
  FRAUD: {
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    // Fara cheia `decision`: prezenta ei in rezultat inseamna ca o regula a
    // fixat decizia explicit. Altfel decizia se deduce din scor, prin praguri.
    defaultDecision: {
      riskScore: 0,
      signals: [],
      thresholds: { challenge: 30, review: 55, block: 80 },
    },
  },
  AVAILABILITY: {
    // Aceeasi situatie ca la SHIPPING: decizia are campuri independente
    // (disponibil, ascuns, plafon, badge-uri, mesaj), deci un singur castigator
    // ar arunca in silentiu regulile care nu au castigat. Se aplica toate;
    // prioritatea mai mare are ultimul cuvant pe campurile suprascrise.
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
