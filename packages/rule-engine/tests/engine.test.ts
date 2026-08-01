import { describe, expect, it } from "vitest";
import { evaluateRuleSet } from "../src/engine";
import { EngineRule, RuleSetSnapshot } from "../src/types";

function rule(partial: Partial<EngineRule> & Pick<EngineRule, "key">): EngineRule {
  return {
    name: partial.key,
    priority: 100,
    enabled: true,
    conditions: { type: "condition", fact: "always", operator: "exists" },
    actions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 5 } }],
    ...partial,
  };
}

function pricingSnapshot(
  rules: EngineRule[],
  overrides: Partial<RuleSetSnapshot> = {},
): RuleSetSnapshot {
  return {
    key: "pricing",
    category: "PRICING",
    version: 7,
    conflictStrategy: "PRIORITY_FIRST_MATCH",
    defaultDecision: { discountPercent: 0 },
    rules,
    ...overrides,
  };
}

const vipContext = {
  always: true,
  customer: { loyaltyTier: "VIP", country: "RO" },
  cart: { totalCents: 45000 },
};

describe("evaluateRuleSet — flux de baza", () => {
  it("aplica regula potrivita si intoarce explicatia", () => {
    const snapshot = pricingSnapshot([
      rule({
        key: "vip-discount",
        conditions: {
          type: "condition",
          fact: "customer.loyaltyTier",
          operator: "eq",
          value: "VIP",
        },
        actions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 15 } }],
      }),
    ]);

    const result = evaluateRuleSet(snapshot, vipContext);

    expect(result.decision).toEqual({ discountPercent: 15 });
    expect(result.matchedRules).toEqual(["vip-discount"]);
    expect(result.rulesetVersion).toBe(7);
    expect(result.usedDefault).toBe(false);
    expect(result.traceId).toMatch(/^eval-/);
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]).toMatchObject({
      ruleKey: "vip-discount",
      matched: true,
      appliedActions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 15 } }],
    });
  });

  it("fara potrivire => defaultDecision si usedDefault", () => {
    const snapshot = pricingSnapshot([
      rule({
        key: "de-only",
        conditions: { type: "condition", fact: "customer.country", operator: "eq", value: "DE" },
      }),
    ]);
    const result = evaluateRuleSet(snapshot, vipContext);
    expect(result.decision).toEqual({ discountPercent: 0 });
    expect(result.matchedRules).toEqual([]);
    expect(result.usedDefault).toBe(true);
  });

  it("regulile disabled sunt sarite si marcate in trace", () => {
    const snapshot = pricingSnapshot([rule({ key: "off", enabled: false })]);
    const result = evaluateRuleSet(snapshot, vipContext);
    expect(result.usedDefault).toBe(true);
    expect(result.trace[0]).toMatchObject({
      evaluated: false,
      skippedReason: "disabled",
    });
  });

  it("fereastra de valabilitate este respectata", () => {
    const snapshot = pricingSnapshot([
      rule({ key: "expired", effectiveTo: "2026-01-01T00:00:00Z" }),
      rule({ key: "future", effectiveFrom: "2027-01-01T00:00:00Z" }),
      rule({ key: "current", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: "2026-12-31T00:00:00Z" }),
    ]);
    const result = evaluateRuleSet(snapshot, {
      ...vipContext,
      now: "2026-07-01T12:00:00Z",
    });
    expect(result.matchedRules).toEqual(["current"]);
    const reasons = Object.fromEntries(
      result.trace.map((t) => [t.ruleKey, t.skippedReason]),
    );
    expect(reasons.expired).toBe("expired");
    expect(reasons.future).toBe("not-yet-effective");
  });

  it("kill switch pe ruleset => defaultDecision fara evaluare", () => {
    const snapshot = pricingSnapshot([rule({ key: "any" })]);
    const result = evaluateRuleSet(snapshot, vipContext, { killSwitch: true });
    expect(result.decision).toEqual({ discountPercent: 0 });
    expect(result.trace).toEqual([]);
    expect(result.usedDefault).toBe(true);
  });

  it("kill switch granular pe o singura regula", () => {
    const snapshot = pricingSnapshot([
      rule({ key: "killed", priority: 200 }),
      rule({ key: "survivor", priority: 100 }),
    ]);
    const result = evaluateRuleSet(snapshot, vipContext, {
      killedRuleKeys: ["killed"],
    });
    expect(result.matchedRules).toEqual(["survivor"]);
  });

  it("este determinist pentru acelasi input", () => {
    const snapshot = pricingSnapshot([rule({ key: "r1" })]);
    const context = { ...vipContext, now: "2026-07-01T12:00:00Z" };
    const a = evaluateRuleSet(snapshot, context, { traceId: "eval-fixed" });
    const b = evaluateRuleSet(snapshot, context, { traceId: "eval-fixed" });
    expect(a).toEqual(b);
  });
});

describe("strategii de conflict", () => {
  const highRule = rule({
    key: "high",
    priority: 200,
    actions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 10 } }],
  });
  const lowRule = rule({
    key: "low",
    priority: 50,
    actions: [
      { type: "SET_DISCOUNT_PERCENT", params: { value: 25 } },
      { type: "ADD_PRICE_BADGE", params: { badge: "MEGA-SALE" } },
    ],
  });

  it("PRIORITY_FIRST_MATCH: castiga doar regula cu prioritatea cea mai mare", () => {
    const result = evaluateRuleSet(
      pricingSnapshot([lowRule, highRule], { conflictStrategy: "PRIORITY_FIRST_MATCH" }),
      vipContext,
    );
    expect(result.matchedRules).toEqual(["high"]);
    expect(result.decision.discountPercent).toBe(10);
  });

  it("PRIORITY_ALL_MATCHES: toate se aplica, prioritatea mare are ultimul cuvant", () => {
    const result = evaluateRuleSet(
      pricingSnapshot([lowRule, highRule], { conflictStrategy: "PRIORITY_ALL_MATCHES" }),
      vipContext,
    );
    expect(result.matchedRules).toEqual(["low", "high"]);
    // high suprascrie discountul setat de low, dar badge-ul lui low ramane
    expect(result.decision.discountPercent).toBe(10);
    expect(result.decision.badges).toEqual(["MEGA-SALE"]);
  });

  it("MOST_SPECIFIC: castiga regula cu cele mai multe conditii", () => {
    const generic = rule({
      key: "generic",
      priority: 500,
      actions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 5 } }],
    });
    const specific = rule({
      key: "specific",
      priority: 10,
      conditions: {
        type: "group",
        op: "AND",
        children: [
          { type: "condition", fact: "customer.loyaltyTier", operator: "eq", value: "VIP" },
          { type: "condition", fact: "cart.totalCents", operator: "gte", value: 40000 },
        ],
      },
      actions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 20 } }],
    });
    const result = evaluateRuleSet(
      pricingSnapshot([generic, specific], { conflictStrategy: "MOST_SPECIFIC" }),
      vipContext,
    );
    expect(result.matchedRules).toEqual(["specific"]);
    expect(result.decision.discountPercent).toBe(20);
  });

  it("BEST_FOR_CUSTOMER pe PRICING: castiga reducerea cea mai mare", () => {
    const result = evaluateRuleSet(
      pricingSnapshot([highRule, lowRule], { conflictStrategy: "BEST_FOR_CUSTOMER" }),
      vipContext,
    );
    expect(result.matchedRules).toEqual(["low"]);
    expect(result.decision.discountPercent).toBe(25);
  });

  it("BEST_FOR_CUSTOMER pe SHIPPING: castiga livrarea gratuita", () => {
    const snapshot: RuleSetSnapshot = {
      key: "shipping",
      category: "SHIPPING",
      version: 1,
      conflictStrategy: "BEST_FOR_CUSTOMER",
      defaultDecision: { costCents: 1999, freeShipping: false },
      rules: [
        rule({
          key: "cheap",
          priority: 300,
          actions: [{ type: "SET_SHIPPING_COST", params: { costCents: 999 } }],
        }),
        rule({
          key: "free-over-400",
          priority: 100,
          conditions: { type: "condition", fact: "cart.totalCents", operator: "gte", value: 40000 },
          actions: [{ type: "FREE_SHIPPING", params: {} }],
        }),
      ],
    };
    const result = evaluateRuleSet(snapshot, vipContext);
    expect(result.matchedRules).toEqual(["free-over-400"]);
    expect(result.decision).toMatchObject({ freeShipping: true, costCents: 0 });
  });
});

describe("scenariu FRAUD cumulativ", () => {
  it("acumuleaza scor de risc din mai multe reguli", () => {
    const snapshot: RuleSetSnapshot = {
      key: "fraud",
      category: "FRAUD",
      version: 3,
      conflictStrategy: "PRIORITY_ALL_MATCHES",
      defaultDecision: { riskScore: 0, decision: "ALLOW", signals: [] },
      rules: [
        rule({
          key: "guest-high-value",
          priority: 100,
          conditions: {
            type: "group",
            op: "AND",
            children: [
              { type: "condition", fact: "session.isGuest", operator: "isTrue" },
              { type: "condition", fact: "cart.totalCents", operator: "gte", value: 100000 },
            ],
          },
          actions: [
            { type: "ADD_RISK_SCORE", params: { value: 40 } },
            { type: "FLAG_SIGNAL", params: { signal: "guest-high-value" } },
          ],
        }),
        rule({
          key: "mismatched-country",
          priority: 90,
          conditions: {
            type: "group",
            op: "NOT",
            children: [
              { type: "condition", fact: "session.ipCountry", operator: "eq", value: "RO" },
            ],
          },
          actions: [
            { type: "ADD_RISK_SCORE", params: { value: 30 } },
            { type: "FLAG_SIGNAL", params: { signal: "ip-country-mismatch" } },
          ],
        }),
        rule({
          key: "block-threshold",
          priority: 1000,
          conditions: { type: "condition", fact: "cart.totalCents", operator: "gte", value: 500000 },
          actions: [{ type: "SET_FRAUD_DECISION", params: { decision: "BLOCK" } }],
        }),
      ],
    };

    const result = evaluateRuleSet(snapshot, {
      session: { isGuest: true, ipCountry: "XX" },
      cart: { totalCents: 150000 },
    });

    expect(result.decision.riskScore).toBe(70);
    expect(result.decision.signals).toEqual([
      "ip-country-mismatch",
      "guest-high-value",
    ]);
    expect(result.decision.decision).toBe("ALLOW"); // sub pragul de block
    expect(result.matchedRules).toEqual(["mismatched-country", "guest-high-value"]);
  });
});
