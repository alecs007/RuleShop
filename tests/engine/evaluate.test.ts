import { describe, expect, it } from "vitest";
import { evaluateCondition, resolveFact } from "@/lib/engine/evaluate";
import { ConditionNode, EngineError } from "@/lib/engine/types";

const context = {
  customer: {
    country: "RO",
    loyaltyTier: "VIP",
    completedOrders: 12,
    attributes: { newsletter: true },
  },
  cart: {
    totalCents: 45000,
    itemCount: 3,
    categories: ["electronics", "accessories"],
  },
};

describe("resolveFact", () => {
  it("rezolva cai dot-notation", () => {
    expect(resolveFact(context, "customer.country")).toBe("RO");
    expect(resolveFact(context, "customer.attributes.newsletter")).toBe(true);
    expect(resolveFact(context, "cart.totalCents")).toBe(45000);
  });

  it("intoarce undefined pentru cai lipsa, fara exceptii", () => {
    expect(resolveFact(context, "customer.missing.deep")).toBeUndefined();
    expect(resolveFact(context, "")).toBeUndefined();
    expect(resolveFact(context, "cart.totalCents.nested")).toBeUndefined();
  });
});

describe("evaluateCondition", () => {
  it("evalueaza o frunza simpla si produce trace", () => {
    const node: ConditionNode = {
      type: "condition",
      fact: "cart.totalCents",
      operator: "gte",
      value: 20000,
    };
    const { result, trace } = evaluateCondition(node, context);
    expect(result).toBe(true);
    expect(trace).toMatchObject({
      type: "condition",
      fact: "cart.totalCents",
      actual: 45000,
      expected: 20000,
      result: true,
    });
  });

  it("AND cere toate conditiile adevarate", () => {
    const node: ConditionNode = {
      type: "group",
      op: "AND",
      children: [
        { type: "condition", fact: "customer.country", operator: "eq", value: "RO" },
        { type: "condition", fact: "cart.totalCents", operator: "gte", value: 50000 },
      ],
    };
    const { result, trace } = evaluateCondition(node, context);
    expect(result).toBe(false);
    expect(trace.type).toBe("group");
    if (trace.type === "group") {
      expect(trace.children.map((c) => c.result)).toEqual([true, false]);
    }
  });

  it("OR cere cel putin una adevarata", () => {
    const node: ConditionNode = {
      type: "group",
      op: "OR",
      children: [
        { type: "condition", fact: "customer.loyaltyTier", operator: "eq", value: "GOLD" },
        { type: "condition", fact: "customer.completedOrders", operator: "gte", value: 10 },
      ],
    };
    expect(evaluateCondition(node, context).result).toBe(true);
  });

  it("NOT inverseaza rezultatul copilului", () => {
    const node: ConditionNode = {
      type: "group",
      op: "NOT",
      children: [
        { type: "condition", fact: "customer.country", operator: "eq", value: "DE" },
      ],
    };
    expect(evaluateCondition(node, context).result).toBe(true);
  });

  it("grupuri imbricate: AND(OR(...), NOT(...))", () => {
    const node: ConditionNode = {
      type: "group",
      op: "AND",
      children: [
        {
          type: "group",
          op: "OR",
          children: [
            { type: "condition", fact: "customer.loyaltyTier", operator: "eq", value: "VIP" },
            { type: "condition", fact: "cart.totalCents", operator: "gte", value: 100000 },
          ],
        },
        {
          type: "group",
          op: "NOT",
          children: [
            { type: "condition", fact: "cart.categories", operator: "contains", value: "restricted" },
          ],
        },
      ],
    };
    expect(evaluateCondition(node, context).result).toBe(true);
  });

  it("fact lipsa => frunza false, nu exceptie", () => {
    const node: ConditionNode = {
      type: "condition",
      fact: "customer.nonexistent",
      operator: "eq",
      value: "x",
    };
    const { result, trace } = evaluateCondition(node, context);
    expect(result).toBe(false);
    expect(trace).toMatchObject({ actual: undefined, result: false });
  });

  it("operator necunoscut => EngineError", () => {
    const node: ConditionNode = {
      type: "condition",
      fact: "customer.country",
      operator: "regexEval",
      value: ".*",
    };
    expect(() => evaluateCondition(node, context)).toThrowError(EngineError);
  });
});
