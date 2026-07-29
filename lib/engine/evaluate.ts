/**
 * Evaluarea arborelui de conditii.
 *
 * Rezolva fapte prin cai dot-notation din contextul de evaluare si produce,
 * pe langa rezultatul boolean, un trace complet (fiecare frunza cu valoarea
 * gasita si rezultatul ei) — baza pentru "explicatia fiecarei evaluari".
 */

import { getOperator } from "./operators";
import {
  ConditionNode,
  ConditionTrace,
  EngineError,
  EvaluationContext,
} from "./types";

/**
 * Rezolva o cale dot-notation ("cart.items.0.sku") in context.
 * Intoarce undefined daca orice segment lipseste — nu arunca niciodata.
 */
export function resolveFact(context: EvaluationContext, path: string): unknown {
  if (!path) return undefined;
  let current: unknown = context;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export interface ConditionEvaluation {
  result: boolean;
  trace: ConditionTrace;
}

export function evaluateCondition(
  node: ConditionNode,
  context: EvaluationContext,
): ConditionEvaluation {
  if (node.type === "condition") {
    const operator = getOperator(node.operator);
    if (!operator) {
      throw new EngineError(
        `Operator necunoscut: "${node.operator}"`,
        "UNKNOWN_OPERATOR",
      );
    }
    const actual = resolveFact(context, node.fact);
    const result = operator.test(actual, node.value);
    return {
      result,
      trace: {
        type: "condition",
        fact: node.fact,
        operator: node.operator,
        expected: operator.unary ? undefined : node.value,
        actual,
        result,
      },
    };
  }

  // grup logic
  const childEvals = node.children.map((child) =>
    evaluateCondition(child, context),
  );
  let result: boolean;
  switch (node.op) {
    case "AND":
      result = childEvals.length > 0 && childEvals.every((c) => c.result);
      break;
    case "OR":
      result = childEvals.some((c) => c.result);
      break;
    case "NOT":
      // Validarea garanteaza exact un copil; definim NOT peste conjunctie
      // pentru robustete.
      result = !(childEvals.length > 0 && childEvals.every((c) => c.result));
      break;
    default:
      throw new EngineError(
        `Grup logic necunoscut: "${(node as { op: string }).op}"`,
        "INVALID_CONDITION",
      );
  }

  return {
    result,
    trace: {
      type: "group",
      op: node.op,
      result,
      children: childEvals.map((c) => c.trace),
    },
  };
}

/** Numarul de frunze dintr-un arbore — masura de specificitate a unei reguli. */
export function countConditionLeaves(node: ConditionNode): number {
  if (node.type === "condition") return 1;
  return node.children.reduce((sum, c) => sum + countConditionLeaves(c), 0);
}
