/**
 * Renders structured rules as Romanian prose for administrators. Pure, so the
 * rule editor can use it for its live preview on the client too.
 *
 * Two things separate readable from clumsy: predicates agree with the gender
 * and number of the fact label (`FactDef.form`), and boolean facts are already
 * statements, so they are negated rather than suffixed with "is true".
 */
import {
  getAction,
  getOperator,
  type ConditionNode,
  type RuleAction,
} from "@ruleshop/rule-engine";
import { formatMoney } from "@/lib/utils/money";
import { getFact, type FactDef } from "./facts";

function isCentsPath(path: string): boolean {
  return path.endsWith("Cents") || path.endsWith("Spend");
}

/** Adds the fact's unit, so a bare "10000" does not end up in the sentence. */
function formatFactValue(value: number, path: string): string {
  if (isCentsPath(path)) return formatMoney(value);
  if (path.endsWith("Grams")) return `${value.toLocaleString("ro-RO")} g`;
  if (path.endsWith("Days")) return `${value} ${value === 1 ? "zi" : "zile"}`;
  return String(value);
}

/** Placeholder for values not yet filled in the editor. */
const PENDING = "…";

type Form = "m" | "f" | "p";

/**
 * Predicates that agree with the subject, by masculine / feminine / plural.
 * Operators missing here are invariable and use their engine label.
 */
const AGREEMENT: Record<string, Record<Form, string>> = {
  eq: {
    m: "este egal cu",
    f: "este egală cu",
    p: "sunt egale cu",
  },
  neq: {
    m: "este diferit de",
    f: "este diferită de",
    p: "sunt diferite de",
  },
  gt: {
    m: "este mai mare decât",
    f: "este mai mare decât",
    p: "sunt mai mari decât",
  },
  gte: {
    m: "este mai mare sau egal cu",
    f: "este mai mare sau egală cu",
    p: "sunt mai mari sau egale cu",
  },
  lt: {
    m: "este mai mic decât",
    f: "este mai mică decât",
    p: "sunt mai mici decât",
  },
  lte: {
    m: "este mai mic sau egal cu",
    f: "este mai mică sau egală cu",
    p: "sunt mai mici sau egale cu",
  },
  between: { m: "este între", f: "este între", p: "sunt între" },
  in: { m: "este în lista", f: "este în lista", p: "sunt în lista" },
  notIn: {
    m: "nu este în lista",
    f: "nu este în lista",
    p: "nu sunt în lista",
  },
  contains: { m: "conține", f: "conține", p: "conțin" },
  notContains: { m: "nu conține", f: "nu conține", p: "nu conțin" },
  containsAny: {
    m: "conține oricare din",
    f: "conține oricare din",
    p: "conțin oricare din",
  },
  containsAll: {
    m: "conține toate",
    f: "conține toate",
    p: "conțin toate",
  },
  startsWith: { m: "începe cu", f: "începe cu", p: "încep cu" },
  endsWith: { m: "se termină cu", f: "se termină cu", p: "se termină cu" },
};

function predicate(operatorId: string, form: Form): string {
  const agreed = AGREEMENT[operatorId]?.[form];
  if (agreed) return agreed;
  return getOperator(operatorId)?.label ?? operatorId;
}

/** Lowercases the first letter mid-sentence, leaving acronyms (SKU) alone. */
function factPhrase(label: string): string {
  const [first, second] = [label[0] ?? "", label[1] ?? ""];
  const isAcronym = second !== "" && second === second.toUpperCase() && /\p{L}/u.test(second);
  return isAcronym ? label : first.toLowerCase() + label.slice(1);
}

/** The editor label loses its unit suffix: the value already carries one. */
function subject(fact: FactDef | undefined, path: string): string {
  if (fact?.phrase) return fact.phrase;
  const label = (fact?.label ?? path).replace(/\s*\([^)]*\)\s*$/, "");
  return factPhrase(label);
}

function formatValue(value: unknown, factPath?: string): string {
  if (value === undefined || value === null || value === "") return PENDING;
  if (Array.isArray(value)) {
    if (value.length === 0) return PENDING;
    return value.map((v) => formatValue(v, factPath)).join(", ");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return PENDING;
    return factPath ? formatFactValue(value, factPath) : String(value);
  }
  if (typeof value === "boolean") return value ? "adevărat" : "fals";
  return `„${String(value)}”`;
}

function param(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (v === undefined || v === null || v === "") return PENDING;
  if (typeof v === "number" && !Number.isFinite(v)) return PENDING;
  return String(v);
}

function moneyParam(params: Record<string, unknown>, key: string): string {
  const v = Number(params[key]);
  return Number.isFinite(v) && params[key] !== "" && params[key] !== undefined
    ? formatMoney(v)
    : PENDING;
}

function quoted(params: Record<string, unknown>, key: string): string {
  const value = param(params, key);
  return value === PENDING ? PENDING : `„${value}”`;
}

/** Boolean facts are statements already, so isTrue/isFalse only negate. */
function leafPhrase(
  fact: FactDef | undefined,
  path: string,
  operatorId: string,
  value: unknown,
): string {
  const label = subject(fact, path);
  const form: Form = fact?.form ?? "m";
  const operator = getOperator(operatorId);

  if (fact?.type === "boolean") {
    if (operatorId === "isTrue") return label;
    if (operatorId === "isFalse") return `NU ${label}`;
  }
  if (operatorId === "exists") return `${label} există`;
  if (operatorId === "notExists") return `${label} nu există`;
  if (operator?.unary) return `${label} ${operator.label}`;

  if (operatorId === "between" && Array.isArray(value)) {
    return `${label} ${predicate("between", form)} ${formatValue(value[0], path)} și ${formatValue(value[1], path)}`;
  }
  return `${label} ${predicate(operatorId, form)} ${formatValue(value, path)}`;
}

export function humanizeConditions(node: ConditionNode): string {
  if (node.type === "condition") {
    return leafPhrase(getFact(node.fact), node.fact, node.operator, node.value);
  }

  const children = node.children.map((child) => {
    const text = humanizeConditions(child);
    return child.type === "group" ? `(${text})` : text;
  });
  if (node.op === "NOT") return `NU: ${children.join(" și ")}`;
  return children.join(node.op === "AND" ? " ȘI " : " SAU ");
}

const FRAUD_DECISION_PHRASES: Record<string, string> = {
  ALLOW: "permite comanda",
  CHALLENGE: "cere o verificare suplimentară",
  REVIEW: "trimite comanda la verificare manuală",
  BLOCK: "blochează comanda",
};

export function humanizeAction(action: RuleAction): string {
  const params = action.params ?? {};

  switch (action.type) {
    case "SET_DISCOUNT_PERCENT":
      return `aplică o reducere de ${param(params, "value")}%`;
    case "ADD_DISCOUNT_PERCENT":
      return `adaugă încă ${param(params, "value")}% reducere`;
    case "SET_DISCOUNT_FIXED":
      return `scade ${moneyParam(params, "valueCents")} din preț`;
    case "SET_PRICE_OVERRIDE":
      return `fixează prețul la ${moneyParam(params, "priceCents")}`;
    case "SET_PRICE_MULTIPLIER":
      return `înmulțește prețul cu ${param(params, "factor")}`;
    case "ADD_PRICE_BADGE":
      return `afișează badge-ul ${quoted(params, "badge")}`;

    case "SET_SHIPPING_COST":
      return `costul livrării devine ${moneyParam(params, "costCents")}`;
    case "FREE_SHIPPING":
      return "livrarea este gratuită";
    case "DISABLE_SHIPPING_METHOD":
      return `dezactivează metoda ${quoted(params, "method")}`;
    case "FORCE_SHIPPING_METHOD":
      return `permite doar metoda ${quoted(params, "method")}`;
    case "SET_SHIPPING_ETA":
      return `estimează livrarea în ${param(params, "minDays")}–${param(params, "maxDays")} zile`;

    case "ADD_RISK_SCORE":
      return `adaugă ${param(params, "value")} la scorul de risc`;
    case "SET_FRAUD_DECISION": {
      const decision = param(params, "decision");
      return FRAUD_DECISION_PHRASES[decision] ?? `decizie antifraudă: ${decision}`;
    }
    case "FLAG_SIGNAL":
      return `marchează semnalul ${quoted(params, "signal")}`;

    case "SET_AVAILABILITY":
      return params.available === true
        ? "marchează produsul ca disponibil"
        : "marchează produsul ca indisponibil";
    case "HIDE_PRODUCT":
      return "ascunde produsul din catalog";
    case "LIMIT_QUANTITY":
      return `limitează la ${param(params, "maxQuantity")} bucăți per comandă`;
    case "SET_AVAILABILITY_MESSAGE":
      return `afișează mesajul ${quoted(params, "message")}`;
    case "ADD_AVAILABILITY_BADGE":
      return `afișează badge-ul ${quoted(params, "badge")}`;
    case "SET_LOW_STOCK_THRESHOLD":
      return `avertizează „ultimele bucăți" sub ${param(params, "threshold")} în stoc`;

    case "SET_POINTS_MULTIPLIER":
      return `acordă puncte × ${param(params, "factor")}`;
    case "GRANT_BONUS_POINTS":
      return `acordă ${param(params, "points")} puncte bonus`;
    case "GRANT_BENEFIT":
      return `acordă beneficiul ${quoted(params, "benefit")}`;
    case "SET_LOYALTY_TIER":
      return `nivelul de loialitate devine ${quoted(params, "tier")}`;

    case "SET_THEME_TOKEN":
      return `setează tema: ${param(params, "token")} = ${param(params, "value")}`;
    case "SET_BANNER":
      return `afișează bannerul ${quoted(params, "message")}`;
    case "SET_LAYOUT_VARIANT":
      return `folosește layoutul ${quoted(params, "variant")}`;

    default: {
      // An action with no phrasing of its own yet: label plus parameters.
      const label = getAction(action.type)?.label ?? action.type;
      const paramText = Object.entries(params)
        .map(([key, value]) => `${key}: ${formatValue(value)}`)
        .join(", ");
      return paramText ? `${factPhrase(label)} (${paramText})` : factPhrase(label);
    }
  }
}

export interface HumanizedRule {
  if: string;
  then: string;
}

export function humanizeRule(
  conditions: ConditionNode,
  actions: RuleAction[],
): HumanizedRule {
  return {
    if: humanizeConditions(conditions),
    then: actions.map(humanizeAction).join(" + "),
  };
}

/** Tolerant variant for unknown data: old snapshots, hand-written JSON. */
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
