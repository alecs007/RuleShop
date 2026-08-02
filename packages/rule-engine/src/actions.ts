/**
 * The action catalog. An action is a pure function over the draft decision;
 * nothing here executes user-supplied code.
 *
 * Decision shape per category:
 *  PRICING      -> { discountPercent, discountFixedCents, priceOverrideCents,
 *                    priceMultiplier, badges[] }
 *  SHIPPING     -> { costCents, freeShipping, disabledMethods[],
 *                    forcedMethod, etaDaysMin, etaDaysMax }
 *  FRAUD        -> { riskScore, decision: ALLOW|CHALLENGE|REVIEW|BLOCK, signals[] }
 *  AVAILABILITY -> { available, hidden, maxQuantityPerOrder, lowStockThreshold,
 *                    badges[], message }
 *  LOYALTY      -> { pointsMultiplier, bonusPoints, benefits[], tier }
 *  THEME        -> { tokens: {name -> CSS value}, banner, layoutVariant }
 */

import { DecisionCategory, EngineError, RuleAction } from "./types";

export type Decision = Record<string, unknown>;

export interface ActionParamSpec {
  name: string;
  type: "number" | "string" | "boolean" | "string[]" | "record";
  required: boolean;
  min?: number;
  max?: number;
  oneOf?: string[];
  /** Anchored RegExp source, for value sets too large to enumerate. */
  pattern?: string;
  maxLength?: number;
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

/**
 * The theme tokens a rule may change. The list is closed on purpose: a token's
 * value ends up in a CSS property, so a free-form name would mean arbitrary
 * writes into the page's styling. `lib/shop/theme-view.ts` maps them to the
 * real CSS variables.
 */
export const THEME_TOKENS = [
  "accent",
  "accent-ink",
  "surface",
  "surface-raised",
  "ink",
  "ink-muted",
  "line",
  "positive",
  "caution",
  "critical",
  "radius-card",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

export const THEME_LAYOUT_VARIANTS = ["default", "compact", "spacious"] as const;

export type ThemeLayoutVariant = (typeof THEME_LAYOUT_VARIANTS)[number];

/**
 * Accepted token values: a hex colour, a colour function with strictly numeric
 * arguments, or a length. Nothing else — no `url(`, no `;`, no braces, so
 * there is no escaping the CSS declaration.
 */
export const THEME_VALUE_PATTERN =
  "^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\\( *[0-9]{1,3}(\\.[0-9]+)?(%| *deg)? *(( *[,/] *| +)[0-9]{1,3}(\\.[0-9]+)?%?){2,3} *\\)|[0-9]{1,4}(\\.[0-9]{1,3})?(px|rem|em|%)?)$";

export const THEME_BANNER_MAX_LENGTH = 160;

const defs: ActionDef[] = [
  {
    type: "SET_DISCOUNT_PERCENT",
    category: "PRICING",
    label: "Setează reducere procentuală",
    params: [{ name: "value", type: "number", required: true, min: 0, max: 100 }],
    apply: (d, p) => ({ ...d, discountPercent: num(p, "value") }),
  },
  {
    type: "ADD_DISCOUNT_PERCENT",
    category: "PRICING",
    label: "Adaugă reducere procentuală (cumulativ)",
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
    label: "Setează reducere fixă (bani)",
    params: [{ name: "valueCents", type: "number", required: true, min: 0 }],
    apply: (d, p) => ({ ...d, discountFixedCents: num(p, "valueCents") }),
  },
  {
    type: "SET_PRICE_OVERRIDE",
    category: "PRICING",
    label: "Suprascrie prețul",
    params: [{ name: "priceCents", type: "number", required: true, min: 0 }],
    apply: (d, p) => ({ ...d, priceOverrideCents: num(p, "priceCents") }),
  },
  {
    type: "SET_PRICE_MULTIPLIER",
    category: "PRICING",
    label: "Multiplică prețul (ex: 1.2 pentru +20%)",
    params: [{ name: "factor", type: "number", required: true, min: 0 }],
    apply: (d, p) => ({ ...d, priceMultiplier: num(p, "factor") }),
  },
  {
    type: "ADD_PRICE_BADGE",
    category: "PRICING",
    label: "Adaugă badge de preț (ex: PROMO)",
    params: [{ name: "badge", type: "string", required: true }],
    apply: (d, p) => ({ ...d, badges: appendUnique(d.badges, [str(p, "badge")]) }),
  },

  {
    type: "SET_SHIPPING_COST",
    category: "SHIPPING",
    label: "Setează costul livrării",
    params: [{ name: "costCents", type: "number", required: true, min: 0 }],
    apply: (d, p) => ({ ...d, costCents: num(p, "costCents"), freeShipping: false }),
  },
  {
    type: "FREE_SHIPPING",
    category: "SHIPPING",
    label: "Livrare gratuită",
    params: [],
    apply: (d) => ({ ...d, freeShipping: true, costCents: 0 }),
  },
  {
    type: "DISABLE_SHIPPING_METHOD",
    category: "SHIPPING",
    label: "Dezactivează o metodă de livrare",
    params: [{ name: "method", type: "string", required: true }],
    apply: (d, p) => ({
      ...d,
      disabledMethods: appendUnique(d.disabledMethods, [str(p, "method")]),
    }),
  },
  {
    type: "FORCE_SHIPPING_METHOD",
    category: "SHIPPING",
    label: "Impune o metodă de livrare",
    params: [{ name: "method", type: "string", required: true }],
    apply: (d, p) => ({ ...d, forcedMethod: str(p, "method") }),
  },
  {
    type: "SET_SHIPPING_ETA",
    category: "SHIPPING",
    label: "Setează estimarea de livrare (zile)",
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

  {
    type: "ADD_RISK_SCORE",
    category: "FRAUD",
    label: "Adaugă la scorul de risc",
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
    label: "Setează decizia antifraudă",
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
    label: "Marchează un semnal de risc",
    params: [{ name: "signal", type: "string", required: true }],
    apply: (d, p) => ({ ...d, signals: appendUnique(d.signals, [str(p, "signal")]) }),
  },

  {
    type: "SET_AVAILABILITY",
    category: "AVAILABILITY",
    label: "Setează disponibilitatea",
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
    label: "Limitează cantitatea per comandă",
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
  {
    type: "ADD_AVAILABILITY_BADGE",
    category: "AVAILABILITY",
    label: "Adaugă badge de disponibilitate (ex: PRECOMANDĂ)",
    params: [{ name: "badge", type: "string", required: true }],
    apply: (d, p) => ({ ...d, badges: appendUnique(d.badges, [str(p, "badge")]) }),
  },
  {
    type: "SET_LOW_STOCK_THRESHOLD",
    category: "AVAILABILITY",
    label: "Sub ce stoc se avertizează „ultimele bucăți”",
    params: [{ name: "threshold", type: "number", required: true, min: 0, max: 1000 }],
    apply: (d, p) => ({ ...d, lowStockThreshold: num(p, "threshold") }),
  },

  {
    type: "SET_POINTS_MULTIPLIER",
    category: "LOYALTY",
    label: "Multiplicator de puncte",
    // Capped: points are money, and a mistyped x1000 cannot be taken back.
    params: [{ name: "factor", type: "number", required: true, min: 0, max: 50 }],
    apply: (d, p) => ({ ...d, pointsMultiplier: num(p, "factor") }),
  },
  {
    type: "GRANT_BONUS_POINTS",
    category: "LOYALTY",
    label: "Acordă puncte bonus",
    params: [{ name: "points", type: "number", required: true, min: 0, max: 100000 }],
    apply: (d, p) => ({
      ...d,
      bonusPoints:
        (typeof d.bonusPoints === "number" ? d.bonusPoints : 0) + num(p, "points"),
    }),
  },
  {
    type: "GRANT_BENEFIT",
    category: "LOYALTY",
    label: "Acordă un beneficiu (ex: retur extins)",
    params: [{ name: "benefit", type: "string", required: true }],
    apply: (d, p) => ({
      ...d,
      benefits: appendUnique(d.benefits, [str(p, "benefit")]),
    }),
  },
  {
    type: "SET_LOYALTY_TIER",
    category: "LOYALTY",
    label: "Setează nivelul de loialitate",
    params: [{ name: "tier", type: "string", required: true }],
    apply: (d, p) => ({ ...d, tier: str(p, "tier") }),
  },

  {
    type: "SET_THEME_TOKEN",
    category: "THEME",
    label: "Setează un token de temă (ex: culoare accent)",
    params: [
      { name: "token", type: "string", required: true, oneOf: [...THEME_TOKENS] },
      {
        name: "value",
        type: "string",
        required: true,
        pattern: THEME_VALUE_PATTERN,
        maxLength: 32,
      },
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
    label: "Setează bannerul magazinului",
    params: [
      {
        name: "message",
        type: "string",
        required: true,
        maxLength: THEME_BANNER_MAX_LENGTH,
      },
    ],
    apply: (d, p) => ({ ...d, banner: str(p, "message") }),
  },
  {
    type: "SET_LAYOUT_VARIANT",
    category: "THEME",
    label: "Setează varianta de layout",
    params: [
      {
        name: "variant",
        type: "string",
        required: true,
        oneOf: [...THEME_LAYOUT_VARIANTS],
      },
    ],
    apply: (d, p) => ({ ...d, layoutVariant: str(p, "variant") }),
  },
];

const byType = new Map(defs.map((d) => [d.type, d]));

export const ACTIONS: ReadonlyMap<string, ActionDef> = byType;

export function getAction(type: string): ActionDef | undefined {
  return byType.get(type);
}

export function actionsForCategory(category: DecisionCategory): ActionDef[] {
  return defs.filter((d) => d.category === category);
}

/**
 * Throws on an unknown action or a category mismatch: validation rejects those
 * on save, so reaching here means a broken snapshot, not bad user input.
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
