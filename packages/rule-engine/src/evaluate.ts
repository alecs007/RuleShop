import { getOperator } from "./operators";
import {
  ConditionNode,
  ConditionTrace,
  EngineError,
  EvaluationContext,
} from "./types";

/** Resolves "cart.items.0.sku". A missing segment gives undefined, never a throw. */
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
      // Validation guarantees a single child; negating the conjunction keeps
      // the result sane if one ever slips through with more.
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

/** Leaf count, used as a rule's specificity under MOST_SPECIFIC. */
export function countConditionLeaves(node: ConditionNode): number {
  if (node.type === "condition") return 1;
  return node.children.reduce((sum, c) => sum + countConditionLeaves(c), 0);
}
