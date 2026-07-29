import { describe, expect, it } from "vitest";
import { validateRule, validateSnapshot } from "@/lib/engine/schemas";
import { EngineRule, RuleSetSnapshot } from "@/lib/engine/types";

const validRule: EngineRule = {
  key: "vip-discount",
  name: "Reducere VIP",
  priority: 100,
  enabled: true,
  conditions: {
    type: "condition",
    fact: "customer.loyaltyTier",
    operator: "eq",
    value: "VIP",
  },
  actions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 15 } }],
};

describe("validateRule", () => {
  it("accepta o regula valida", () => {
    expect(validateRule(validRule, "PRICING")).toEqual([]);
  });

  it("respinge operator necunoscut", () => {
    const bad = {
      ...validRule,
      conditions: { ...validRule.conditions, operator: "hax" },
    } as EngineRule;
    const issues = validateRule(bad, "PRICING");
    expect(issues.some((i) => i.message.includes("Operator necunoscut"))).toBe(true);
  });

  it("respinge valoare lipsa la operator binar", () => {
    const bad = {
      ...validRule,
      conditions: { type: "condition", fact: "cart.totalCents", operator: "gte" },
    } as EngineRule;
    const issues = validateRule(bad, "PRICING");
    expect(issues.some((i) => i.message.includes("necesită o valoare"))).toBe(true);
  });

  it("respinge valoare la operator unar", () => {
    const bad = {
      ...validRule,
      conditions: {
        type: "condition",
        fact: "customer.active",
        operator: "isTrue",
        value: true,
      },
    } as EngineRule;
    const issues = validateRule(bad, "PRICING");
    expect(issues.some((i) => i.message.includes("unar"))).toBe(true);
  });

  it("respinge actiune din alta categorie", () => {
    const bad = {
      ...validRule,
      actions: [{ type: "FREE_SHIPPING", params: {} }],
    } as EngineRule;
    const issues = validateRule(bad, "PRICING");
    expect(issues.some((i) => i.message.includes("SHIPPING"))).toBe(true);
  });

  it("respinge parametri in afara intervalului", () => {
    const bad = {
      ...validRule,
      actions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 150 } }],
    } as EngineRule;
    const issues = validateRule(bad, "PRICING");
    expect(issues.some((i) => i.message.includes("<= 100"))).toBe(true);
  });

  it("respinge NOT cu mai multi copii", () => {
    const bad = {
      ...validRule,
      conditions: {
        type: "group",
        op: "NOT",
        children: [
          { type: "condition", fact: "a", operator: "exists" },
          { type: "condition", fact: "b", operator: "exists" },
        ],
      },
    } as EngineRule;
    const issues = validateRule(bad, "PRICING");
    expect(issues.some((i) => i.message.includes("NOT"))).toBe(true);
  });

  it("respinge fereastra de valabilitate inversata", () => {
    const bad: EngineRule = {
      ...validRule,
      effectiveFrom: "2026-12-01T00:00:00Z",
      effectiveTo: "2026-01-01T00:00:00Z",
    };
    const issues = validateRule(bad, "PRICING");
    expect(issues.some((i) => i.message.includes("inversată"))).toBe(true);
  });

  it("respinge chei care nu sunt kebab-case", () => {
    const bad = { ...validRule, key: "Vip Discount!" };
    const issues = validateRule(bad, "PRICING");
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("validateSnapshot", () => {
  const snapshot: RuleSetSnapshot = {
    key: "pricing",
    category: "PRICING",
    version: 1,
    conflictStrategy: "PRIORITY_FIRST_MATCH",
    defaultDecision: { discountPercent: 0 },
    rules: [validRule],
  };

  it("accepta un snapshot valid", () => {
    expect(validateSnapshot(snapshot).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("respinge chei de reguli duplicate", () => {
    const issues = validateSnapshot({
      ...snapshot,
      rules: [validRule, { ...validRule }],
    });
    expect(issues.some((i) => i.message.includes("duplicată"))).toBe(true);
  });

  it("avertizeaza la prioritati egale sub PRIORITY_FIRST_MATCH", () => {
    const issues = validateSnapshot({
      ...snapshot,
      rules: [validRule, { ...validRule, key: "other-rule" }],
    });
    expect(issues.some((i) => i.severity === "warning")).toBe(true);
  });
});
