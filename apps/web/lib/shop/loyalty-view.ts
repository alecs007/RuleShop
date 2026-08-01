/**
 * Recompensele de loialitate — nucleul PUR (fara DB, fara sesiune, fara
 * server-only), ca sa poata fi folosit identic de magazin, de testerul din
 * control plane si de teste.
 *
 * Modelul deciziei: valoarea comenzii da un numar de puncte de BAZA (rata
 * implicita a magazinului), iar rulesetul LOYALTY decide cat se multiplica,
 * ce puncte bonus se adauga peste, ce beneficii primeste clientul si ce nivel
 * i se afiseaza. Regulile nu inlocuiesc calculul de baza — il modifica.
 *
 * Fail-safe: fara ruleset publicat (sau cu kill switch activ) clientul primeste
 * in continuare punctele de baza, la nivelul contului lui. Loialitatea nu se
 * "stinge" cand regulile sunt oprite; doar bonusurile dispar.
 *
 * De ce nivelul impus de reguli NU se scrie in cont: `customer.loyaltyTier` este
 * un FAPT de intrare pentru evaluare. Daca decizia s-ar salva in profil, urmatoarea
 * evaluare ar citi propriul ei rezultat si o regula de forma „DACĂ nivelul e
 * VIP ATUNCI nivelul devine VIP+" s-ar autoalimenta. Nivelul din decizie este
 * deci nivelul EFECTIV, calculat la fiecare evaluare — ce se persista pe cont
 * rămâne doar soldul de puncte, derivat din comenzi.
 */
import { evaluateRuleSet, type RuleSetSnapshot } from "@ruleshop/rule-engine";

/** Cati bani valoreaza un punct: 1 punct pentru fiecare unitate de moneda. */
export const CENTS_PER_POINT = 100;

/**
 * Plafon de siguranta pentru multiplicator. Catalogul de actiuni il impune deja
 * la validare (`SET_POINTS_MULTIPLIER`, max), dar snapshot-urile publicate
 * inainte de plafon trebuie sa rămână inofensive.
 */
export const MAX_POINTS_MULTIPLIER = 50;

/** Nivelul implicit al unui client fara istoric. */
export const DEFAULT_LOYALTY_TIER = "STANDARD";

/** Faptele despre cos folosite de regulile de loialitate. */
export interface LoyaltyCartFacts {
  subtotalCents: number;
  itemCount: number;
  weightGrams: number;
  categories: string[];
}

/** Faptele despre comanda care se plaseaza; lipsesc inainte de checkout. */
export interface LoyaltyOrderFacts {
  totalCents: number;
  shippingCents: number;
  paymentMethod?: string;
}

export interface ActorFacts {
  customer: Record<string, unknown>;
  session: Record<string, unknown>;
}

const GUEST_ACTOR: ActorFacts = {
  customer: { loyaltyTier: DEFAULT_LOYALTY_TIER, loyaltyPoints: 0, completedOrders: 0 },
  session: { isGuest: true, isAuthenticated: false },
};

export interface LoyaltyView {
  /** Suma pe care se acorda puncte: subtotalul, dupa reduceri, fara livrare. */
  eligibleCents: number;
  /** Punctele din valoarea comenzii, inainte de reguli. */
  basePoints: number;
  pointsMultiplier: number;
  bonusPoints: number;
  /** Punctele acordate efectiv: round(basePoints × multiplicator) + bonus. */
  points: number;
  /** Cate puncte au adus regulile peste calculul de baza. */
  extraPoints: number;
  /** Beneficii ne-monetare acordate de reguli (ex: „retur extins 60 de zile"). */
  benefits: string[];
  /** Nivelul efectiv: cel impus de o regula, altfel cel al contului. */
  tier: string;
  /** true cand nivelul vine dintr-o regula, nu din cont. */
  tierFromRule: boolean;
  /**
   * Punctele se pot credita efectiv. Cumparatorii in regim guest nu au un cont
   * pe care sa se acumuleze — punctele se calculeaza si se afiseaza (ca sa se
   * vada ce ar câștiga cu un cont), dar nu se acorda.
   */
  creditable: boolean;
  matchedRules: string[];
  rulesetVersion: number | null;
  traceId: string | null;
  /** true cand nu exista ruleset publicat sau kill switch-ul e activ. */
  usedDefaults: boolean;
}

export interface LoyaltyComputation {
  /** Snapshotul publicat; null => nu s-a publicat nimic. */
  snapshot: RuleSetSnapshot | null;
  killSwitch?: boolean;
  cart: LoyaltyCartFacts;
  order?: LoyaltyOrderFacts;
  actor?: ActorFacts;
  /** Moment fix, pentru simulari reproductibile. */
  now?: string;
}

/** Numar finit ≥ 0, altfel `fallback`. */
function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function tierOf(actor: ActorFacts): string {
  const tier = actor.customer.loyaltyTier;
  return typeof tier === "string" && tier.trim() !== ""
    ? tier.trim()
    : DEFAULT_LOYALTY_TIER;
}

/** Punctele de baza pentru o suma: se rotunjeste in jos, nu in favoarea nimanui. */
export function basePointsFor(eligibleCents: number): number {
  return Math.floor(Math.max(0, eligibleCents) / CENTS_PER_POINT);
}

/**
 * Recompensele pentru cosul/comanda data, dupa rulesetul LOYALTY.
 * Functie pura: acelasi snapshot + acelasi context => acelasi rezultat.
 */
export function computeLoyalty(input: LoyaltyComputation): LoyaltyView {
  const { snapshot, cart } = input;
  const actor = input.actor ?? GUEST_ACTOR;
  const creditable = actor.session.isAuthenticated === true;

  const eligibleCents = Math.max(0, cart.subtotalCents);
  const basePoints = basePointsFor(eligibleCents);

  if (!snapshot || input.killSwitch) {
    return {
      eligibleCents,
      basePoints,
      pointsMultiplier: 1,
      bonusPoints: 0,
      points: basePoints,
      extraPoints: 0,
      benefits: [],
      tier: tierOf(actor),
      tierFromRule: false,
      creditable,
      matchedRules: [],
      rulesetVersion: snapshot?.version ?? null,
      traceId: null,
      usedDefaults: true,
    };
  }

  const result = evaluateRuleSet(snapshot, {
    ...(input.now ? { now: input.now } : {}),
    cart,
    ...(input.order ? { order: input.order } : {}),
    customer: actor.customer,
    session: actor.session,
  });
  const decision = result.decision;

  const pointsMultiplier = Math.min(
    MAX_POINTS_MULTIPLIER,
    positiveNumber(decision.pointsMultiplier, 1),
  );
  const bonusPoints = Math.floor(positiveNumber(decision.bonusPoints, 0));
  const points = Math.round(basePoints * pointsMultiplier) + bonusPoints;

  const benefits = Array.isArray(decision.benefits)
    ? [
        ...new Set(
          decision.benefits.filter(
            (b): b is string => typeof b === "string" && b.trim() !== "",
          ),
        ),
      ]
    : [];

  const ruleTier =
    typeof decision.tier === "string" && decision.tier.trim() !== ""
      ? decision.tier.trim()
      : null;

  return {
    eligibleCents,
    basePoints,
    pointsMultiplier,
    bonusPoints,
    points,
    extraPoints: points - basePoints,
    benefits,
    tier: ruleTier ?? tierOf(actor),
    tierFromRule: ruleTier !== null,
    creditable,
    matchedRules: result.matchedRules,
    rulesetVersion: result.rulesetVersion,
    traceId: result.traceId,
    usedDefaults: false,
  };
}

// ---------------------------------------------------------------------------
// Ajutoare pentru interfata
// ---------------------------------------------------------------------------

/** „12 puncte" / „1 punct" — acordul se cere in prea multe locuri ca sa-l repet. */
export function pointsLabel(points: number): string {
  return `${points} ${points === 1 ? "punct" : "puncte"}`;
}

/**
 * De ce clientul primeste exact atatea puncte, intr-o propozitie.
 * Aceeasi explicatie in magazin, in comanda si in testerul din control plane.
 */
export function explainLoyalty(view: LoyaltyView): string {
  if (view.points === 0) {
    return view.usedDefaults
      ? "Nicio regulă activă — comanda nu acumulează puncte."
      : "Comanda nu acumulează puncte.";
  }

  const parts: string[] = [`${pointsLabel(view.basePoints)} din valoarea comenzii`];
  if (view.pointsMultiplier !== 1) {
    parts.push(`× ${view.pointsMultiplier}`);
  }
  if (view.bonusPoints > 0) {
    parts.push(`+ ${pointsLabel(view.bonusPoints)} bonus`);
  }
  return parts.join(" ");
}
