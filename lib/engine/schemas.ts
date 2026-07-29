/**
 * Validarea structurala (Zod) si semantica a regulilor si snapshot-urilor.
 *
 * Doua niveluri:
 *  1. schema Zod — forma corecta a datelor (arbore de conditii, actiuni etc);
 *  2. validare semantica — operatori/actiuni existente, compatibilitatea
 *     operatorului cu valoarea, parametrii actiunilor in intervalele permise.
 * Ambele ruleaza la salvarea/publicarea unei reguli; motorul primeste doar
 * date deja validate.
 */

import { z } from "zod";
import { getAction } from "./actions";
import { getOperator } from "./operators";
import {
  CONFLICT_STRATEGIES,
  ConditionNode,
  DECISION_CATEGORIES,
  EngineRule,
  RuleSetSnapshot,
} from "./types";

// ---------------------------------------------------------------------------
// Scheme Zod
// ---------------------------------------------------------------------------

const conditionLeafSchema = z.object({
  type: z.literal("condition"),
  fact: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_.]*$/, "Cale de fact invalida"),
  operator: z.string().min(1),
  value: z.unknown().optional(),
});

export const conditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([
    conditionLeafSchema,
    z.object({
      type: z.literal("group"),
      op: z.enum(["AND", "OR", "NOT"]),
      children: z.array(conditionNodeSchema).min(1).max(50),
    }),
  ]),
) as z.ZodType<ConditionNode>;

export const ruleActionSchema = z.object({
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const engineRuleSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Cheia regulii: kebab-case (ex: vip-discount)"),
  name: z.string().min(1).max(200),
  priority: z.number().int().min(0).max(10000),
  enabled: z.boolean(),
  conditions: conditionNodeSchema,
  actions: z.array(ruleActionSchema).min(1).max(20),
  effectiveFrom: z.iso.datetime({ offset: true }).nullish(),
  effectiveTo: z.iso.datetime({ offset: true }).nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ruleSetSnapshotSchema = z.object({
  key: z.string().min(1).max(100),
  category: z.enum(DECISION_CATEGORIES),
  version: z.number().int().min(1),
  conflictStrategy: z.enum(CONFLICT_STRATEGIES),
  defaultDecision: z.record(z.string(), z.unknown()),
  rules: z.array(engineRuleSchema).max(500),
});

// ---------------------------------------------------------------------------
// Validare semantica
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  /** Cale lizibila catre problema, ex: "rules[2].conditions.children[0]". */
  path: string;
  message: string;
  severity: "error" | "warning";
}

function expectedValueMatchesOperator(
  operatorId: string,
  value: unknown,
): string | null {
  const op = getOperator(operatorId);
  if (!op) return `Operator necunoscut: "${operatorId}"`;
  if (op.unary) {
    return value === undefined
      ? null
      : `Operatorul "${operatorId}" este unar si nu accepta o valoare`;
  }
  if (value === undefined) {
    return `Operatorul "${operatorId}" necesita o valoare de comparatie`;
  }
  // compatibilitate operator <-> tipul VALORII de comparatie
  switch (operatorId) {
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      if (typeof value !== "number" && Number.isNaN(Date.parse(String(value)))) {
        return `Operatorul "${operatorId}" cere un numar sau o data`;
      }
      return null;
    case "between":
      if (!Array.isArray(value) || value.length !== 2) {
        return `Operatorul "between" cere o lista [min, max]`;
      }
      return null;
    case "in":
    case "notIn":
    case "containsAny":
    case "containsAll":
      if (!Array.isArray(value) || value.length === 0) {
        return `Operatorul "${operatorId}" cere o lista nevida de valori`;
      }
      return null;
    case "startsWith":
    case "endsWith":
      if (typeof value !== "string") {
        return `Operatorul "${operatorId}" cere un text`;
      }
      return null;
    default:
      return null;
  }
}

function validateConditionTree(
  node: ConditionNode,
  path: string,
  issues: ValidationIssue[],
): void {
  if (node.type === "condition") {
    const problem = expectedValueMatchesOperator(node.operator, node.value);
    if (problem) issues.push({ path, message: problem, severity: "error" });
    return;
  }
  if (node.op === "NOT" && node.children.length !== 1) {
    issues.push({
      path,
      message: "Grupul NOT trebuie sa aiba exact un copil",
      severity: "error",
    });
  }
  node.children.forEach((child, i) =>
    validateConditionTree(child, `${path}.children[${i}]`, issues),
  );
}

function validateActionsSemantics(
  rule: EngineRule,
  category: RuleSetSnapshot["category"],
  path: string,
  issues: ValidationIssue[],
): void {
  rule.actions.forEach((action, i) => {
    const actionPath = `${path}.actions[${i}]`;
    const def = getAction(action.type);
    if (!def) {
      issues.push({
        path: actionPath,
        message: `Actiune necunoscuta: "${action.type}"`,
        severity: "error",
      });
      return;
    }
    if (def.category !== category) {
      issues.push({
        path: actionPath,
        message: `Actiunea "${action.type}" apartine categoriei ${def.category}, nu ${category}`,
        severity: "error",
      });
      return;
    }
    for (const spec of def.params) {
      const value = action.params?.[spec.name];
      if (value === undefined) {
        if (spec.required) {
          issues.push({
            path: actionPath,
            message: `Parametrul "${spec.name}" este obligatoriu`,
            severity: "error",
          });
        }
        continue;
      }
      if (spec.type === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          issues.push({
            path: actionPath,
            message: `Parametrul "${spec.name}" trebuie sa fie numar`,
            severity: "error",
          });
          continue;
        }
        if (spec.min !== undefined && value < spec.min) {
          issues.push({
            path: actionPath,
            message: `Parametrul "${spec.name}" trebuie sa fie >= ${spec.min}`,
            severity: "error",
          });
        }
        if (spec.max !== undefined && value > spec.max) {
          issues.push({
            path: actionPath,
            message: `Parametrul "${spec.name}" trebuie sa fie <= ${spec.max}`,
            severity: "error",
          });
        }
      } else if (spec.type === "string") {
        if (typeof value !== "string" || value.length === 0) {
          issues.push({
            path: actionPath,
            message: `Parametrul "${spec.name}" trebuie sa fie text nevid`,
            severity: "error",
          });
        } else if (spec.oneOf && !spec.oneOf.includes(value)) {
          issues.push({
            path: actionPath,
            message: `Parametrul "${spec.name}" trebuie sa fie unul din: ${spec.oneOf.join(", ")}`,
            severity: "error",
          });
        }
      } else if (spec.type === "boolean" && typeof value !== "boolean") {
        issues.push({
          path: actionPath,
          message: `Parametrul "${spec.name}" trebuie sa fie boolean`,
          severity: "error",
        });
      }
    }
  });
}

/**
 * Valideaza o regula in contextul categoriei rulesetului ei.
 * Intoarce lista de probleme (goala = valida).
 */
export function validateRule(
  rule: EngineRule,
  category: RuleSetSnapshot["category"],
  path = "rule",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const parsed = engineRuleSchema.safeParse(rule);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        path: `${path}.${issue.path.join(".")}`,
        message: issue.message,
        severity: "error",
      });
    }
    return issues; // fara forma valida nu are sens validarea semantica
  }

  validateConditionTree(rule.conditions, `${path}.conditions`, issues);
  validateActionsSemantics(rule, category, path, issues);

  if (rule.effectiveFrom && rule.effectiveTo) {
    if (Date.parse(rule.effectiveFrom) > Date.parse(rule.effectiveTo)) {
      issues.push({
        path: `${path}.effectiveTo`,
        message: "Fereastra de valabilitate este inversata (from > to)",
        severity: "error",
      });
    }
  }

  return issues;
}

/** Valideaza un snapshot intreg inainte de publicare. */
export function validateSnapshot(snapshot: RuleSetSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const parsed = ruleSetSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        path: issue.path.join("."),
        message: issue.message,
        severity: "error",
      });
    }
    return issues;
  }

  const seenKeys = new Set<string>();
  snapshot.rules.forEach((rule, i) => {
    if (seenKeys.has(rule.key)) {
      issues.push({
        path: `rules[${i}].key`,
        message: `Cheie duplicata: "${rule.key}"`,
        severity: "error",
      });
    }
    seenKeys.add(rule.key);
    issues.push(...validateRule(rule, snapshot.category, `rules[${i}]`));
  });

  // avertismente utile in control plane
  const priorities = new Map<number, string[]>();
  for (const rule of snapshot.rules) {
    const keys = priorities.get(rule.priority) ?? [];
    keys.push(rule.key);
    priorities.set(rule.priority, keys);
  }
  if (snapshot.conflictStrategy === "PRIORITY_FIRST_MATCH") {
    for (const [priority, keys] of priorities) {
      if (keys.length > 1) {
        issues.push({
          path: "rules",
          message: `Regulile [${keys.join(", ")}] au aceeasi prioritate (${priority}) sub PRIORITY_FIRST_MATCH — ordinea de castig este alfabetica, verifica intentia`,
          severity: "warning",
        });
      }
    }
  }

  return issues;
}
