/**
 * Disponibilitatea unui produs — nucleul PUR (fara DB, fara sesiune, fara
 * server-only), ca sa poata fi folosit identic de magazin, de testerul din
 * control plane si de teste.
 *
 * Modelul deciziei: stocul din baza de date spune ce EXISTA, rulesetul
 * AVAILABILITY spune ce se poate CUMPARA si ce se VEDE. Regulile pot doar sa
 * restranga: pot ascunde un produs, il pot marca indisponibil, pot plafona
 * cantitatea per comanda, pot schimba mesajul si badge-urile. Nu pot inventa
 * stoc — un produs cu stoc 0 rămâne necumparabil oricat de permisiva ar fi
 * regula, altfel comanda ar pica oricum la scaderea atomica a stocului.
 *
 * Fail-safe: fara ruleset publicat (sau cu kill switch activ) produsul se
 * comporta ca intr-un magazin obisnuit — disponibil cat timp are stoc.
 */
import { evaluateRuleSet, type RuleSetSnapshot } from "@ruleshop/rule-engine";

/** Sub acest stoc se afiseaza „ultimele bucăți", daca nicio regula nu decide altfel. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** Plafon absolut per comanda, indiferent de reguli (protectie de bun-simt). */
export const HARD_QUANTITY_CAP = 99;

/** Faptele de produs pe care le vad regulile de disponibilitate. */
export interface ProductAvailabilityFacts {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  basePriceCents: number;
  stock: number;
  tags: string[];
  /** Atribute arbitrare ale produsului (`Product.attributes`). */
  attributes?: Record<string, unknown>;
}

export interface ActorFacts {
  customer: Record<string, unknown>;
  session: Record<string, unknown>;
}

const GUEST_ACTOR: ActorFacts = {
  customer: { loyaltyTier: "STANDARD", completedOrders: 0 },
  session: { isGuest: true, isAuthenticated: false },
};

/** De ce produsul e (in)disponibil — pentru explicatia din interfata. */
export type AvailabilityReason =
  | "in-stock"
  | "low-stock"
  | "out-of-stock"
  | "blocked-by-rule"
  | "hidden-by-rule";

export interface AvailabilityView {
  productId: string;
  /** Se poate adauga in cos acum. */
  available: boolean;
  /** Scos din catalog de o regula (nu apare in liste, pagina da 404). */
  hidden: boolean;
  /** Stocul real, dupa care se ghideaza si mesajele. */
  stock: number;
  /** Cate bucati poate lua un client intr-o comanda (0 cand e indisponibil). */
  maxPerOrder: number;
  /** Plafonul impus de reguli, daca exista (null = doar stocul limiteaza). */
  ruleLimit: number | null;
  lowStock: boolean;
  lowStockThreshold: number;
  /** Badge-uri adaugate de reguli (ex: PRECOMANDĂ). */
  badges: string[];
  /** Mesaj impus de reguli (ex: „Livrare doar în București"). */
  message: string | null;
  reason: AvailabilityReason;
  matchedRules: string[];
  rulesetVersion: number | null;
  traceId: string | null;
  /** true cand nu exista ruleset publicat sau kill switch-ul e activ. */
  usedDefaults: boolean;
}

export interface AvailabilityComputation {
  product: ProductAvailabilityFacts;
  /** Snapshotul publicat; null => nu s-a publicat nimic. */
  snapshot: RuleSetSnapshot | null;
  killSwitch?: boolean;
  actor?: ActorFacts;
  /** Moment fix, pentru simulari reproductibile. */
  now?: string;
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function reasonOf(view: {
  hidden: boolean;
  ruleBlocked: boolean;
  stock: number;
  available: boolean;
  lowStock: boolean;
}): AvailabilityReason {
  if (view.hidden) return "hidden-by-rule";
  if (view.stock <= 0) return "out-of-stock";
  if (!view.available || view.ruleBlocked) return "blocked-by-rule";
  return view.lowStock ? "low-stock" : "in-stock";
}

/** Comportamentul magazinului fara reguli: conteaza doar stocul. */
function defaultView(
  product: ProductAvailabilityFacts,
  rulesetVersion: number | null,
): AvailabilityView {
  const stock = Math.max(0, product.stock);
  const available = stock > 0;
  const lowStock = available && stock <= DEFAULT_LOW_STOCK_THRESHOLD;

  return {
    productId: product.id,
    available,
    hidden: false,
    stock,
    maxPerOrder: available ? Math.min(stock, HARD_QUANTITY_CAP) : 0,
    ruleLimit: null,
    lowStock,
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    badges: [],
    message: null,
    reason: reasonOf({
      hidden: false,
      ruleBlocked: false,
      stock,
      available,
      lowStock,
    }),
    matchedRules: [],
    rulesetVersion,
    traceId: null,
    usedDefaults: true,
  };
}

/**
 * Disponibilitatea completa a unui produs, dupa rulesetul AVAILABILITY.
 * Functie pura: acelasi snapshot + acelasi context => acelasi rezultat.
 */
export function computeAvailability(
  input: AvailabilityComputation,
): AvailabilityView {
  const { product, snapshot } = input;
  const stock = Math.max(0, product.stock);

  if (!snapshot || input.killSwitch) {
    return defaultView(product, snapshot?.version ?? null);
  }

  const actor = input.actor ?? GUEST_ACTOR;
  const result = evaluateRuleSet(snapshot, {
    ...(input.now ? { now: input.now } : {}),
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      brand: product.brand,
      basePriceCents: product.basePriceCents,
      stock,
      tags: product.tags,
      ...(product.attributes ?? {}),
    },
    customer: actor.customer,
    session: actor.session,
  });

  const decision = result.decision;
  const hidden = decision.hidden === true;
  // Doar `false` explicit blocheaza; orice altceva lasa stocul sa decida.
  const ruleBlocked = decision.available === false;
  const ruleLimit = positiveInt(decision.maxQuantityPerOrder);
  const threshold =
    positiveInt(decision.lowStockThreshold) ?? DEFAULT_LOW_STOCK_THRESHOLD;

  const available = stock > 0 && !hidden && !ruleBlocked && ruleLimit !== 0;
  const maxPerOrder = available
    ? Math.min(stock, ruleLimit ?? HARD_QUANTITY_CAP, HARD_QUANTITY_CAP)
    : 0;
  const lowStock = available && stock <= threshold;

  const message =
    typeof decision.message === "string" && decision.message.trim() !== ""
      ? decision.message.trim()
      : null;
  const badges = Array.isArray(decision.badges)
    ? decision.badges.filter((b): b is string => typeof b === "string")
    : [];

  return {
    productId: product.id,
    available,
    hidden,
    stock,
    maxPerOrder,
    ruleLimit,
    lowStock,
    lowStockThreshold: threshold,
    badges,
    message,
    reason: reasonOf({ hidden, ruleBlocked, stock, available, lowStock }),
    matchedRules: result.matchedRules,
    rulesetVersion: result.rulesetVersion,
    traceId: result.traceId,
    usedDefaults: false,
  };
}

// ---------------------------------------------------------------------------
// Ajutoare pentru interfata si pentru cos
// ---------------------------------------------------------------------------

/** Eticheta scurta de stoc, aceeasi in catalog, pe pagina de produs si in tester. */
export function availabilityLabel(view: AvailabilityView): string {
  if (view.message) return view.message;
  switch (view.reason) {
    case "hidden-by-rule":
      return "Ascuns din catalog";
    case "blocked-by-rule":
      return "Indisponibil";
    case "out-of-stock":
      return "Stoc epuizat";
    case "low-stock":
      return `Ultimele ${view.stock} bucăți`;
    default:
      return "În stoc";
  }
}

export type AvailabilityTone = "positive" | "caution" | "critical";

export function availabilityTone(view: AvailabilityView): AvailabilityTone {
  if (!view.available) return "critical";
  return view.lowStock ? "caution" : "positive";
}

/** Ce limiteaza cantitatea ceruta: stocul, o regula, sau nimic. */
export type QuantityLimit = "stock" | "rule" | null;

export interface ClampedQuantity {
  quantity: number;
  limitedBy: QuantityLimit;
}

/**
 * Aduce o cantitate ceruta in intervalul permis. `limitedBy` spune cine a taiat
 * din ea, ca sa i se poata explica clientului („poți cumpăra maximum 2 bucăți").
 */
export function clampQuantity(
  view: AvailabilityView,
  requested: number,
): ClampedQuantity {
  if (!view.available || view.maxPerOrder <= 0) {
    return { quantity: 0, limitedBy: view.ruleLimit === 0 ? "rule" : "stock" };
  }
  if (requested <= view.maxPerOrder) {
    return { quantity: Math.max(0, Math.floor(requested)), limitedBy: null };
  }
  // Plafonul de regula e mai strans decat stocul ⇒ regula a taiat, nu stocul.
  const limitedBy: QuantityLimit =
    view.ruleLimit !== null && view.ruleLimit <= view.stock ? "rule" : "stock";
  return { quantity: view.maxPerOrder, limitedBy };
}

/** Motivul, in limbaj natural, pentru mesajele de eroare din cos si checkout. */
export function unavailableMessage(
  view: AvailabilityView,
  productName: string,
): string {
  switch (view.reason) {
    case "hidden-by-rule":
    case "blocked-by-rule":
      return view.message ?? `„${productName}" nu mai este disponibil.`;
    case "out-of-stock":
      return `„${productName}" nu mai este în stoc.`;
    default:
      return `„${productName}" nu poate fi comandat acum.`;
  }
}
