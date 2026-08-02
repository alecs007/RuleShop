/**
 * The operator registry. Each operator declares the fact types it accepts, so
 * the editor and the validation can offer only compatible ones. Incompatible
 * types compare to false, never to an exception.
 */

export type FactType = "string" | "number" | "boolean" | "date" | "array" | "any";

export interface OperatorDef {
  id: string;
  label: string;
  factTypes: FactType[];
  /** true if the operator needs no `value`. */
  unary?: boolean;
  test: (actual: unknown, expected: unknown) => boolean;
}

export function factTypeOf(value: unknown): FactType | "null" {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "any";
  }
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/** Dates arrive as Date, ISO string or numeric timestamp. */
function asTime(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function compareNumeric(
  actual: unknown,
  expected: unknown,
  cmp: (a: number, b: number) => boolean,
): boolean {
  const a = asNumber(actual);
  const b = asNumber(expected);
  if (a !== null && b !== null) return cmp(a, b);
  // Fall back to comparing them as dates.
  const ta = asTime(actual);
  const tb = asTime(expected);
  if (ta !== null && tb !== null) return cmp(ta, tb);
  return false;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Equal dates, whatever their representation.
  const ta = asTime(a);
  const tb = asTime(b);
  if (ta !== null && tb !== null && (a instanceof Date || b instanceof Date)) {
    return ta === tb;
  }
  return false;
}

const defs: OperatorDef[] = [
  {
    id: "eq",
    label: "este egal cu",
    factTypes: ["string", "number", "boolean", "date"],
    test: (a, e) => looseEquals(a, e),
  },
  {
    id: "neq",
    label: "este diferit de",
    factTypes: ["string", "number", "boolean", "date"],
    test: (a, e) => !looseEquals(a, e),
  },

  { id: "gt", label: "mai mare decât", factTypes: ["number", "date"], test: (a, e) => compareNumeric(a, e, (x, y) => x > y) },
  { id: "gte", label: "mai mare sau egal", factTypes: ["number", "date"], test: (a, e) => compareNumeric(a, e, (x, y) => x >= y) },
  { id: "lt", label: "mai mic decât", factTypes: ["number", "date"], test: (a, e) => compareNumeric(a, e, (x, y) => x < y) },
  { id: "lte", label: "mai mic sau egal", factTypes: ["number", "date"], test: (a, e) => compareNumeric(a, e, (x, y) => x <= y) },
  {
    id: "between",
    label: "este între (inclusiv)",
    factTypes: ["number", "date"],
    test: (a, e) => {
      if (!Array.isArray(e) || e.length !== 2) return false;
      return (
        compareNumeric(a, e[0], (x, y) => x >= y) &&
        compareNumeric(a, e[1], (x, y) => x <= y)
      );
    },
  },

  {
    id: "in",
    label: "este în listă",
    factTypes: ["string", "number", "boolean"],
    test: (a, e) => Array.isArray(e) && e.some((v) => looseEquals(a, v)),
  },
  {
    id: "notIn",
    label: "nu este în listă",
    factTypes: ["string", "number", "boolean"],
    test: (a, e) => Array.isArray(e) && !e.some((v) => looseEquals(a, v)),
  },

  {
    id: "contains",
    label: "conține",
    factTypes: ["string", "array"],
    test: (a, e) => {
      if (typeof a === "string" && typeof e === "string") {
        return a.toLowerCase().includes(e.toLowerCase());
      }
      if (Array.isArray(a)) return a.some((v) => looseEquals(v, e));
      return false;
    },
  },
  {
    id: "notContains",
    label: "nu conține",
    factTypes: ["string", "array"],
    test: (a, e) => {
      if (typeof a === "string" && typeof e === "string") {
        return !a.toLowerCase().includes(e.toLowerCase());
      }
      if (Array.isArray(a)) return !a.some((v) => looseEquals(v, e));
      return false;
    },
  },
  {
    id: "startsWith",
    label: "începe cu",
    factTypes: ["string"],
    test: (a, e) =>
      typeof a === "string" && typeof e === "string" &&
      a.toLowerCase().startsWith(e.toLowerCase()),
  },
  {
    id: "endsWith",
    label: "se termina cu",
    factTypes: ["string"],
    test: (a, e) =>
      typeof a === "string" && typeof e === "string" &&
      a.toLowerCase().endsWith(e.toLowerCase()),
  },

  {
    id: "containsAny",
    label: "conține oricare din",
    factTypes: ["array"],
    test: (a, e) =>
      Array.isArray(a) && Array.isArray(e) &&
      e.some((v) => a.some((x) => looseEquals(x, v))),
  },
  {
    id: "containsAll",
    label: "conține toate",
    factTypes: ["array"],
    test: (a, e) =>
      Array.isArray(a) && Array.isArray(e) &&
      e.every((v) => a.some((x) => looseEquals(x, v))),
  },

  { id: "exists", label: "există", factTypes: ["any"], unary: true, test: (a) => a !== null && a !== undefined },
  { id: "notExists", label: "nu există", factTypes: ["any"], unary: true, test: (a) => a === null || a === undefined },
  { id: "isTrue", label: "este adevărat", factTypes: ["boolean"], unary: true, test: (a) => a === true },
  { id: "isFalse", label: "este fals", factTypes: ["boolean"], unary: true, test: (a) => a === false },
];

export const OPERATORS: ReadonlyMap<string, OperatorDef> = new Map(
  defs.map((d) => [d.id, d]),
);

export const OPERATOR_IDS = defs.map((d) => d.id);

export function getOperator(id: string): OperatorDef | undefined {
  return OPERATORS.get(id);
}

/** Used by the rule editor to offer only operators that fit the fact. */
export function operatorsForFactType(type: FactType): OperatorDef[] {
  return defs.filter((d) => d.factTypes.includes(type) || d.factTypes.includes("any"));
}
