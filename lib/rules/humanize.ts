/**
 * Traduce regulile structurate in limbaj natural, pentru administratori.
 * Modul PUR (fara server-only) — folosit si in server components, si in
 * previzualizarea live din editorul de reguli (client).
 *
 * Doua lucruri fac diferenta intre „citibil" si „stangaci":
 *  - ACORDUL: predicatul se potriveste cu forma etichetei („țara este egală
 *    cu", nu „țara este egal cu"), dupa `FactDef.form`;
 *  - PREDICATELE BOOLEENE: un fapt boolean este deja o afirmatie, deci se scrie
 *    „dacă adresa de livrare diferă de facturare", nu „... este adevărat".
 */
import {
  getAction,
  getOperator,
  type ConditionNode,
  type RuleAction,
} from "@/lib/engine";
import { formatMoney } from "@/lib/utils/money";
import { getFact, type FactDef } from "./facts";

function isCentsPath(path: string): boolean {
  return path.endsWith("Cents") || path.endsWith("Spend");
}

/**
 * Unitatea in care se citeste valoarea unui fapt. Sumele sunt stocate in bani
 * si afisate in lei; restul primesc sufixul potrivit, ca „10000" sa nu rămână
 * un numar fara sens.
 */
function formatFactValue(value: number, path: string): string {
  if (isCentsPath(path)) return formatMoney(value);
  if (path.endsWith("Grams")) return `${value.toLocaleString("ro-RO")} g`;
  if (path.endsWith("Days")) return `${value} ${value === 1 ? "zi" : "zile"}`;
  return String(value);
}

/** Substituent pentru valori inca necompletate in editor. */
const PENDING = "…";

type Form = "m" | "f" | "p";

/**
 * Predicatele care se acorda cu subiectul. Cheia e operatorul, valoarea sunt
 * formele masculin / feminin / plural. Operatorii care nu apar aici sunt
 * invariabili si isi folosesc eticheta din motor.
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

/** Predicatul acordat cu forma faptului. */
function predicate(operatorId: string, form: Form): string {
  const agreed = AGREEMENT[operatorId]?.[form];
  if (agreed) return agreed;
  return getOperator(operatorId)?.label ?? operatorId;
}

/**
 * Eticheta faptului, in interiorul propozitiei: prima litera devine mica, ca sa
 * nu apara majuscule in mijlocul frazei. Acronimele (SKU) rămân neatinse.
 */
function factPhrase(label: string): string {
  const [first, second] = [label[0] ?? "", label[1] ?? ""];
  const isAcronym = second !== "" && second === second.toUpperCase() && /\p{L}/u.test(second);
  return isAcronym ? label : first.toLowerCase() + label.slice(1);
}

/**
 * Cum se citeste faptul in fraza: forma articulata daca exista, altfel eticheta
 * din editor fara sufixul de unitate — valoarea vine deja cu unitatea ei.
 */
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

/** Parametru text, in ghilimele. */
function quoted(params: Record<string, unknown>, key: string): string {
  const value = param(params, key);
  return value === PENDING ? PENDING : `„${value}”`;
}

// ---------------------------------------------------------------------------
// Condiții
// ---------------------------------------------------------------------------

/**
 * O frunza de condiție, ca propozitie. Faptele booleene sunt deja afirmatii,
 * deci `isTrue`/`isFalse` nu adauga „este adevărat", ci doar neaga la nevoie.
 */
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

/** "DACĂ"-ul regulii: arborele de conditii, in propozitie. */
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

// ---------------------------------------------------------------------------
// Acțiuni
// ---------------------------------------------------------------------------

const FRAUD_DECISION_PHRASES: Record<string, string> = {
  ALLOW: "permite comanda",
  CHALLENGE: "cere o verificare suplimentară",
  REVIEW: "trimite comanda la verificare manuală",
  BLOCK: "blochează comanda",
};

/** "ATUNCI"-ul unei actiuni, ca propozitie. */
export function humanizeAction(action: RuleAction): string {
  const params = action.params ?? {};

  switch (action.type) {
    // Preț
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

    // Livrare
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

    // Antifraudă
    case "ADD_RISK_SCORE":
      return `adaugă ${param(params, "value")} la scorul de risc`;
    case "SET_FRAUD_DECISION": {
      const decision = param(params, "decision");
      return FRAUD_DECISION_PHRASES[decision] ?? `decizie antifraudă: ${decision}`;
    }
    case "FLAG_SIGNAL":
      return `marchează semnalul ${quoted(params, "signal")}`;

    // Disponibilitate
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

    // Loialitate
    case "SET_POINTS_MULTIPLIER":
      return `acordă puncte × ${param(params, "factor")}`;
    case "GRANT_BONUS_POINTS":
      return `acordă ${param(params, "points")} puncte bonus`;
    case "GRANT_BENEFIT":
      return `acordă beneficiul ${quoted(params, "benefit")}`;
    case "SET_LOYALTY_TIER":
      return `nivelul de loialitate devine ${quoted(params, "tier")}`;

    // Temă
    case "SET_THEME_TOKEN":
      return `setează tema: ${param(params, "token")} = ${param(params, "value")}`;
    case "SET_BANNER":
      return `afișează bannerul ${quoted(params, "message")}`;
    case "SET_LAYOUT_VARIANT":
      return `folosește layoutul ${quoted(params, "variant")}`;

    default: {
      // Actiune noua, inca fara frazare dedicata: eticheta + parametrii.
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

/** Regula intreaga: „DACĂ … ATUNCI …". */
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
