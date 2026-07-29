/**
 * Punte intre motor si editorul de reguli: transforma definitiile motorului
 * in optiuni serializabile (fara functii) si reconstruieste starea
 * formularului dintr-o regula stocata.
 */
import {
  OPERATORS,
  actionsForCategory,
  type ConditionNode,
  type DecisionCategory,
  type RuleAction,
} from "@/lib/engine";
import { factsForCategory } from "./facts";
import type {
  ActionOption,
  FactOption,
  OperatorOption,
  RuleFormInitial,
} from "@/components/control-plane/rule-form";

/** Doar faptele care exista in contextul categoriei editate. */
export function getFactOptions(category: DecisionCategory): FactOption[] {
  return factsForCategory(category).map(({ path, label, type, example }) => ({
    path,
    label,
    type,
    example,
  }));
}

export function getOperatorOptions(): OperatorOption[] {
  return Array.from(OPERATORS.values()).map(({ id, label, factTypes, unary }) => ({
    id,
    label,
    factTypes: [...factTypes],
    unary,
  }));
}

/**
 * Valori de configurare ale magazinului oferite ca liste in editor. Nu intra
 * in catalogul motorului: metodele de livrare difera de la magazin la magazin,
 * deci nu pot fi validate ca enum fix in `lib/engine/actions.ts`.
 */
export interface DynamicParamOptions {
  /** Metodele de livrare configurate, pentru parametrul „metodă". */
  shippingMethods?: { value: string; label: string }[];
}

export function getActionOptions(
  category: DecisionCategory,
  dynamic: DynamicParamOptions = {},
): ActionOption[] {
  return actionsForCategory(category).map(({ type, label, params }) => ({
    type,
    label,
    params: params.map((p) => ({
      ...p,
      oneOf: p.oneOf ? [...p.oneOf] : undefined,
      options: p.name === "method" ? dynamic.shippingMethods : undefined,
    })),
  }));
}

function valueToString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * Incearca sa aduca arborele de conditii in forma simpla a editorului
 * (un singur nivel AND/OR cu frunze). Daca structura e mai complexa
 * (grupuri imbricate, NOT), intoarce null — editorul comuta pe modul JSON.
 */
function conditionsToRows(node: ConditionNode): {
  rootOp: "AND" | "OR";
  rows: RuleFormInitial["conditions"];
} {
  const toRow = (leaf: ConditionNode) => {
    if (leaf.type !== "condition") return null;
    const isBetween = leaf.operator === "between" && Array.isArray(leaf.value);
    return {
      fact: leaf.fact,
      operator: leaf.operator,
      value: isBetween
        ? valueToString((leaf.value as unknown[])[0])
        : valueToString(leaf.value),
      value2: isBetween ? valueToString((leaf.value as unknown[])[1]) : "",
    };
  };

  if (node.type === "condition") {
    const row = toRow(node);
    return { rootOp: "AND", rows: row ? [row] : null };
  }
  if (node.op === "NOT") return { rootOp: "AND", rows: null };

  const rows = node.children.map(toRow);
  if (rows.some((r) => r === null)) return { rootOp: node.op, rows: null };
  return { rootOp: node.op, rows: rows as NonNullable<RuleFormInitial["conditions"]> };
}

export function ruleToFormInitial(rule: {
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  conditions: unknown;
  actions: unknown;
}): RuleFormInitial {
  const conditions = rule.conditions as ConditionNode;
  const actions = (rule.actions ?? []) as RuleAction[];
  const { rootOp, rows } = conditionsToRows(conditions);

  return {
    name: rule.name,
    description: rule.description,
    priority: rule.priority,
    enabled: rule.enabled,
    rootOp,
    conditions: rows,
    conditionsJson: JSON.stringify(conditions, null, 2),
    actions: actions.map((a) => ({
      type: a.type,
      params: Object.fromEntries(
        Object.entries(a.params ?? {}).map(([k, v]) => [k, valueToString(v)]),
      ),
    })),
  };
}
