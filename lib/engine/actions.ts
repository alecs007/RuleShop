/**
 * Catalogul de actiuni al motorului, organizat pe categorii de decizie.
 *
 * O actiune este o functie pura: primeste decizia curenta (draft) si
 * parametrii actiunii si intoarce decizia modificata. Nu exista cod
 * executabil venit de la utilizator — doar tipuri de actiuni predefinite,
 * cu parametri validati.
 *
 * Formele deciziilor per categorie (contractul API-ului de decisioning):
 *  PRICING      -> { discountPercent, discountFixedCents, priceOverrideCents,
 *                    priceMultiplier, badges[] }
 *  SHIPPING     -> { costCents, freeShipping, disabledMethods[],
 *                    forcedMethod, etaDaysMin, etaDaysMax }
 *  FRAUD        -> { riskScore, decision: ALLOW|CHALLENGE|REVIEW|BLOCK, signals[] }
 *  AVAILABILITY -> { available, hidden, maxQuantityPerOrder, badges[], message }
 *  LOYALTY      -> { pointsMultiplier, bonusPoints, benefits[] }
 *  THEME        -> { tokens: {cheie->valoare CSS}, banner, layoutVariant }
 */

import { DecisionCategory, EngineError, RuleAction } from "./types";

export type Decision = Record<string, unknown>;

export interface ActionParamSpec {
  name: string;
  type: "number" | "string" | "boolean" | "string[]" | "record";
  required: boolean;
  /** Interval permis pentru numere, ex. procente 0-100. */
  min?: number;
  max?: number;
  /** Valori permise pentru string (enum). */
  oneOf?: string[];
}

export interface ActionDef {
  type: string;
  category: DecisionCategory;
  label: string;
  params: ActionParamSpec[];
  apply: (decision: Decision, params: Record<string, unknown>) => Decision;
}

function num(params: Record<string, unknown>, key: string): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  return typeof v === "string" ? v : "";
}

function appendUnique(list: unknown, items: string[]): string[] {
  const base = Array.isArray(list)
    ? list.filter((x): x is string => typeof x === "string")
    : [];
  return [...new Set([...base, ...items])];
}

const defs: ActionDef[] = [
  // -------------------------------------------------------------- PRICING --
  {
    type: "SET_DISCOUNT_PERCENT",
    category: "PRICING",
    label: "Seteaza reducere procentuala",
    params: [{ name: "value", type: "number", required: true, min: 0, max: 100 }],
    apply: (d, p) => ({ ...d, discountPercent: num(p, "value") }),
  },
  {
    type: "ADD_DISCOUNT_PERCENT",
    category: "PRICING",
    label: "Adauga reducere procentuala (cumulativ)",
    params: [{ name: "value", type: "number", required: true, min: 0, max: 100 }],
    apply: (d, p) => ({
      ...d,
      discountPercent: Math.min(
        100,
        (typeof d.discountPercent === "number" ? d.discountPercent : 0) +
          num(p, "value"),
      ),
    }),
  },
  {
    type: "SET_DISCOUNT_FIXED",
    category: "PRICING",
    label: "Seteaza reducere fixa (bani)",
    params: [{ name: "valueCents", type: "number", required: true, min: 0 }],
    apply: (d, p) => ({ ...d, discountFixedCents: num(p, "valueCents") }),
  },
  {
    type: "SET_PRICE_OVERRIDE",
    category: "PRICING",
    label: "Suprascrie pretul",
    params: [{ name: "priceCents", type: "number", required: true, min: 0 }],
    apply: (d, p) => ({ ...d, priceOverrideCents: num(p, "priceCents") }),
  },
  {
    type: "SET_PRICE_MULTIPLIER",
    category: "PRICING",
    label: "Multiplica pretul (ex: 1.2 pentru +20%)",
    params: [{ name: "factor", type: "number", required: true, min: 0 }],
    apply: (d, p) => ({ ...d, priceMultiplier: num(p, "factor") }),
  },
  {
    type: "ADD_PRICE_BADGE",
    category: "PRICING",
    label: "Adauga badge de pret (ex: PROMO)",
    params: [{ name: "badge", type: "string", required: true }],
    apply: (d, p) => ({ ...d, badges: appendUnique(d.badges, [str(p, "badge")]) }),
  },

  // ------------------------------------------------------------- SHIPPING --
  {
    type: "SET_SHIPPING_COST",
    category: "SHIPPING",
    label: "Seteaza costul livrarii",
    params: [{ name: "costCents", type: "number", required: true, min: 0 }],
    apply: (d, p) => ({ ...d, costCents: num(p, "costCents"), freeShipping: false }),
  },
  {
    type: "FREE_SHIPPING",
    category: "SHIPPING",
    label: "Livrare gratuita",
    params: [],
    apply: (d) => ({ ...d, freeShipping: true, costCents: 0 }),
  },
  {
    type: "DISABLE_SHIPPING_METHOD",
    category: "SHIPPING",
    label: "Dezactiveaza o metoda de livrare",
    params: [{ name: "method", type: "string", required: true }],
    apply: (d, p) => ({
      ...d,
      disabledMethods: appendUnique(d.disabledMethods, [str(p, "method")]),
    }),
  },
  {
    type: "FORCE_SHIPPING_METHOD",
    category: "SHIPPING",
    label: "Impune o metoda de livrare",
    params: [{ name: "method", type: "string", required: true }],
    apply: (d, p) => ({ ...d, forcedMethod: str(p, "method") }),
  },
  {
    type: "SET_SHIPPING_ETA",
    category: "SHIPPING",
    label: "Seteaza estimarea de livrare (zile)",
    params: [
      { name: "minDays", type: "number", required: true, min: 0 },
      { name: "maxDays", type: "number", required: true, min: 0 },
    ],
    apply: (d, p) => ({
      ...d,
      etaDaysMin: num(p, "minDays"),
      etaDaysMax: num(p, "maxDays"),
    }),
  },

  // ---------------------------------------------------------------- FRAUD --
  {
    type: "ADD_RISK_SCORE",
    category: "FRAUD",
    label: "Adauga la scorul de risc",
    params: [{ name: "value", type: "number", required: true }],
    apply: (d, p) => ({
      ...d,
      riskScore: Math.max(
        0,
        (typeof d.riskScore === "number" ? d.riskScore : 0) + num(p, "value"),
      ),
    }),
  },
  {
    type: "SET_FRAUD_DECISION",
    category: "FRAUD",
    label: "Seteaza decizia antifrauda",
    params: [
      {
        name: "decision",
        type: "string",
        required: true,
        oneOf: ["ALLOW", "CHALLENGE", "REVIEW", "BLOCK"],
      },
    ],
    apply: (d, p) => ({ ...d, decision: str(p, "decision") }),
  },
  {
    type: "FLAG_SIGNAL",
    category: "FRAUD",
    label: "Marcheaza un semnal de risc",
    params: [{ name: "signal", type: "string", required: true }],
    apply: (d, p) => ({ ...d, signals: appendUnique(d.signals, [str(p, "signal")]) }),
  },

  // --------------------------------------------------------- AVAILABILITY --
  {
    type: "SET_AVAILABILITY",
    category: "AVAILABILITY",
    label: "Seteaza disponibilitatea",
    params: [{ name: "available", type: "boolean", required: true }],
    apply: (d, p) => ({ ...d, available: p.available === true }),
  },
  {
    type: "HIDE_PRODUCT",
    category: "AVAILABILITY",
    label: "Ascunde produsul din catalog",
    params: [],
    apply: (d) => ({ ...d, hidden: true, available: false }),
  },
  {
    type: "LIMIT_QUANTITY",
    category: "AVAILABILITY",
    label: "Limiteaza cantitatea per comanda",
    params: [{ name: "maxQuantity", type: "number", required: true, min: 1 }],
    apply: (d, p) => ({ ...d, maxQuantityPerOrder: num(p, "maxQuantity") }),
  },
  {
    type: "SET_AVAILABILITY_MESSAGE",
    category: "AVAILABILITY",
    label: "Mesaj de disponibilitate (ex: Stoc limitat)",
    params: [{ name: "message", type: "string", required: true }],
    apply: (d, p) => ({ ...d, message: str(p, "message") }),
  },

  // -------------------------------------------------------------- LOYALTY --
  {
    type: "SET_POINTS_MULTIPLIER",
    category: "LOYALTY",
    label: "Multiplicator de puncte",
    params: [{ name: "factor", type: "number", required: true, min: 0 }],
    apply: (d, p) => ({ ...d, pointsMultiplier: num(p, "factor") }),
  },
  {
    type: "GRANT_BONUS_POINTS",
    category: "LOYALTY",
    label: "Acorda puncte bonus",
    params: [{ name: "points", type: "number", required: true, min: 0 }],
    apply: (d, p) => ({
      ...d,
      bonusPoints:
        (typeof d.bonusPoints === "number" ? d.bonusPoints : 0) + num(p, "points"),
    }),
  },
  {
    type: "GRANT_BENEFIT",
    category: "LOYALTY",
    label: "Acorda un beneficiu (ex: retur extins)",
    params: [{ name: "benefit", type: "string", required: true }],
    apply: (d, p) => ({
      ...d,
      benefits: appendUnique(d.benefits, [str(p, "benefit")]),
    }),
  },

  // ---------------------------------------------------------------- THEME --
  {
    type: "SET_THEME_TOKEN",
    category: "THEME",
    label: "Seteaza un token de tema (ex: culoare accent)",
    params: [
      { name: "token", type: "string", required: true },
      { name: "value", type: "string", required: true },
    ],
    apply: (d, p) => ({
      ...d,
      tokens: {
        ...(typeof d.tokens === "object" && d.tokens !== null ? d.tokens : {}),
        [str(p, "token")]: str(p, "value"),
      },
    }),
  },
  {
    type: "SET_BANNER",
    category: "THEME",
    label: "Seteaza bannerul magazinului",
    params: [{ name: "message", type: "string", required: true }],
    apply: (d, p) => ({ ...d, banner: str(p, "message") }),
  },
  {
    type: "SET_LAYOUT_VARIANT",
    category: "THEME",
    label: "Seteaza varianta de layout",
    params: [{ name: "variant", type: "string", required: true }],
    apply: (d, p) => ({ ...d, layoutVariant: str(p, "variant") }),
  },
];

const byType = new Map(defs.map((d) => [d.type, d]));

export const ACTIONS: ReadonlyMap<string, ActionDef> = byType;

export function getAction(type: string): ActionDef | undefined {
  return byType.get(type);
}

/** Actiunile disponibile pentru o categorie — pentru editorul de reguli. */
export function actionsForCategory(category: DecisionCategory): ActionDef[] {
  return defs.filter((d) => d.category === category);
}

/**
 * Aplica secvential actiunile unei reguli asupra deciziei curente.
 * Arunca EngineError pentru tipuri necunoscute sau categorie nepotrivita —
 * snapshot-urile publicate nu ar trebui sa contina asa ceva (validarea le
 * respinge la salvare), deci aici este o eroare de sistem, nu de utilizator.
 */
export function applyActions(
  decision: Decision,
  actions: RuleAction[],
  category: DecisionCategory,
): Decision {
  let current = decision;
  for (const action of actions) {
    const def = byType.get(action.type);
    if (!def) {
      throw new EngineError(
        `Actiune necunoscuta: "${action.type}"`,
        "UNKNOWN_ACTION",
      );
    }
    if (def.category !== category) {
      throw new EngineError(
        `Actiunea "${action.type}" (${def.category}) nu poate fi folosita intr-un ruleset ${category}`,
        "UNKNOWN_ACTION",
      );
    }
    current = def.apply(current, action.params ?? {});
  }
  return current;
}
