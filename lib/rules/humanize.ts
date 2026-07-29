/**
 * Traduce regulile structurate in limbaj natural, pentru administratori.
 * Modul PUR (fara server-only) — folosit si in server components, si in
 * previzualizarea live din editorul de reguli (client).
 */
import {
  getAction,
  getOperator,
  type ConditionNode,
  type RuleAction,
} from "@/lib/engine";
import { formatMoney } from "@/lib/utils/money";
import { getFact } from "./facts";

function isCentsPath(path: string): boolean {
  return path.endsWith("Cents") || path.endsWith("Spend");
}

/** Substituent pentru valori inca necompletate in editor. */
const PENDING = "…";

function formatValue(value: unknown, factPath?: string): string {
  if (value === undefined || value === null || value === "") return PENDING;
  if (Array.isArray(value)) {
    if (value.length === 0) return PENDING;
    return value.map((v) => formatValue(v, factPath)).join(", ");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return PENDING;
    if (factPath && isCentsPath(factPath)) return formatMoney(value);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "adevărat" : "fals";
  return `„${String(value)}”`;
}

/** Parametru de actiune, cu substituent cand lipseste sau e invalid. */
function param(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (v === undefined || v === null || v === "") return PENDING;
  if (typeof v === "number" && !Number.isFinite(v)) return PENDING;
  return String(v);
}

/** Parametru banesc (stocat in bani) formatat in lei, cu substituent. */
function moneyParam(params: Record<string, unknown>, key: string): string {
  const v = Number(params[key]);
  return Number.isFinite(v) && params[key] !== "" && params[key] !== undefined
    ? formatMoney(v)
    : PENDING;
}

/** "DACA"-ul regulii: arborele de conditii, in propozitie. */
export function humanizeConditions(node: ConditionNode): string {
  if (node.type === "condition") {
    const fact = getFact(node.fact);
    const operator = getOperator(node.operator);
    const factLabel = fact?.label ?? node.fact;
    const opLabel = operator?.label ?? node.operator;
    if (operator?.unary) return `${factLabel} ${opLabel}`;
    if (node.operator === "between" && Array.isArray(node.value)) {
      return `${factLabel} este între ${formatValue(node.value[0], node.fact)} și ${formatValue(node.value[1], node.fact)}`;
    }
    return `${factLabel} ${opLabel} ${formatValue(node.value, node.fact)}`;
  }

  const children = node.children.map((c) => {
    const text = humanizeConditions(c);
    return c.type === "group" ? `(${text})` : text;
  });
  if (node.op === "NOT") return `NU: ${children.join(" și ")}`;
  return children.join(node.op === "AND" ? " ȘI " : " SAU ");
}

/** "ATUNCI"-ul unei actiuni: eticheta + parametrii formatati. */
export function humanizeAction(action: RuleAction): string {
  const def = getAction(action.type);
  const label = def?.label ?? action.type;
  const params = action.params ?? {};

  switch (action.type) {
    case "SET_DISCOUNT_PERCENT":
      return `reducere de ${param(params, "value")}%`;
    case "ADD_DISCOUNT_PERCENT":
      return `încă ${param(params, "value")}% reducere (cumulat)`;
    case "SET_DISCOUNT_FIXED":
      return `reducere fixă de ${moneyParam(params, "valueCents")}`;
    case "SET_PRICE_OVERRIDE":
      return `preț fixat la ${moneyParam(params, "priceCents")}`;
    case "SET_PRICE_MULTIPLIER":
      return `preț înmulțit cu ${param(params, "factor")}`;
    case "ADD_PRICE_BADGE":
      return `badge „${param(params, "badge")}”`;
    case "SET_SHIPPING_COST":
      return `livrare la ${moneyParam(params, "costCents")}`;
    case "FREE_SHIPPING":
      return "livrare gratuită";
    case "DISABLE_SHIPPING_METHOD":
      return `metoda „${param(params, "method")}” nu este disponibilă`;
    case "FORCE_SHIPPING_METHOD":
      return `singura metodă permisă este „${param(params, "method")}”`;
    case "SET_SHIPPING_ETA":
      return `livrare în ${param(params, "minDays")}–${param(params, "maxDays")} zile`;
    case "ADD_RISK_SCORE":
      return `+${param(params, "value")} la scorul de risc`;
    case "SET_FRAUD_DECISION":
      return `decizie antifraudă: ${param(params, "decision")}`;
    case "GRANT_BONUS_POINTS":
      return `${param(params, "points")} puncte bonus`;
    case "SET_POINTS_MULTIPLIER":
      return `puncte x${param(params, "factor")}`;
    default: {
      const paramText = Object.entries(params)
        .map(([k, v]) => `${k}: ${formatValue(v)}`)
        .join(", ");
      return paramText ? `${label} (${paramText})` : label;
    }
  }
}

export interface HumanizedRule {
  if: string;
  then: string;
}

/** Regula intreaga: „DACA … ATUNCI …". */
export function humanizeRule(
  conditions: ConditionNode,
  actions: RuleAction[],
): HumanizedRule {
  return {
    if: humanizeConditions(conditions),
    then: actions.map(humanizeAction).join(" + "),
  };
}

/** Varianta tolerata la date necunoscute (snapshot-uri vechi, JSON manual). */
export function tryHumanizeRule(
  conditions: unknown,
  actions: unknown,
): HumanizedRule | null {
  try {
    return humanizeRule(conditions as ConditionNode, actions as RuleAction[]);
  } catch {
    return null;
  }
}
