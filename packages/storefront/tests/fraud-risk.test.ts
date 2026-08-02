import { describe, expect, it } from "vitest";
import {
  assessFraud,
  decisionFromScore,
  DEFAULT_THRESHOLDS,
  readThresholds,
  riskLevelOf,
  type FraudFacts,
} from "../src/fraud";
import type { EngineRule, RuleSetSnapshot } from "@ruleshop/rule-engine";

function facts(overrides: Partial<FraudFacts> = {}): FraudFacts {
  return {
    cart: { subtotalCents: 50000, itemCount: 2, categories: ["audio"], weightGrams: 1000 },
    customer: { loyaltyTier: "STANDARD", completedOrders: 1 },
    session: {
      isGuest: true,
      isAuthenticated: false,
      ipCountry: "RO",
      ordersLastHour: 0,
      ordersLastDay: 0,
      priorBlocks: 0,
      priorReviews: 0,
      accountAgeDays: 0,
    },
    order: {
      totalCents: 52000,
      shippingCents: 2000,
      shippingCountry: "RO",
      billingCountry: "RO",
      addressMismatch: false,
      paymentMethod: "card",
      itemCount: 2,
    },
    ...overrides,
  };
}

/** The same cart, with the billing address in another country. */
function mismatchedFacts(): FraudFacts {
  const base = facts();
  return {
    ...base,
    order: { ...base.order, addressMismatch: true, billingCountry: "DE" },
  };
}

/** A session with many orders in the last hour (a velocity signal). */
function fastOrdersFacts(): FraudFacts {
  const base = facts();
  return { ...base, session: { ...base.session, ordersLastHour: 6 } };
}

function rule(partial: Partial<EngineRule> & Pick<EngineRule, "key">): EngineRule {
  return {
    name: partial.key,
    priority: 100,
    enabled: true,
    conditions: { type: "condition", fact: "session.isGuest", operator: "isTrue" },
    actions: [{ type: "ADD_RISK_SCORE", params: { value: 40 } }],
    ...partial,
  };
}

function snapshot(rules: EngineRule[], defaultDecision = {}): RuleSetSnapshot {
  return {
    key: "fraud",
    category: "FRAUD",
    version: 3,
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    defaultDecision: { riskScore: 0, signals: [], ...defaultDecision },
    rules,
  };
}

describe("praguri si niveluri", () => {
  it("traduce scorul in decizie", () => {
    const t = DEFAULT_THRESHOLDS;
    expect(decisionFromScore(0, t)).toBe("ALLOW");
    expect(decisionFromScore(29, t)).toBe("ALLOW");
    expect(decisionFromScore(30, t)).toBe("CHALLENGE");
    expect(decisionFromScore(55, t)).toBe("REVIEW");
    expect(decisionFromScore(80, t)).toBe("BLOCK");
    expect(decisionFromScore(500, t)).toBe("BLOCK");
  });

  it("clasifica nivelul de risc", () => {
    expect(riskLevelOf(0)).toBe("LOW");
    expect(riskLevelOf(24)).toBe("LOW");
    expect(riskLevelOf(25)).toBe("MEDIUM");
    expect(riskLevelOf(50)).toBe("HIGH");
    expect(riskLevelOf(75)).toBe("CRITICAL");
  });

  it("citeste praguri din ruleset, cu fallback pe cele implicite", () => {
    expect(readThresholds({ thresholds: { challenge: 10, review: 20, block: 30 } })).toEqual({
      challenge: 10,
      review: 20,
      block: 30,
    });
    // unordered thresholds are ignored
    expect(readThresholds({ thresholds: { challenge: 90, review: 20, block: 30 } })).toEqual(
      DEFAULT_THRESHOLDS,
    );
    expect(readThresholds({})).toEqual(DEFAULT_THRESHOLDS);
    expect(readThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe("assessFraud", () => {
  it("fara ruleset publicat, comanda trece", () => {
    const result = assessFraud({ snapshot: null, facts: facts() });
    expect(result.decision).toBe("ALLOW");
    expect(result.riskScore).toBe(0);
    expect(result.usedDefaults).toBe(true);
  });

  it("kill switch activ => comanda trece, oricat de riscanta ar fi", () => {
    const result = assessFraud({
      snapshot: snapshot([rule({ key: "guest", actions: [{ type: "ADD_RISK_SCORE", params: { value: 90 } }] })]),
      killSwitch: true,
      facts: facts(),
    });
    expect(result.decision).toBe("ALLOW");
    expect(result.usedDefaults).toBe(true);
  });

  it("acumuleaza scor din mai multe reguli si escaladeaza decizia", () => {
    const result = assessFraud({
      snapshot: snapshot([
        rule({
          key: "guest-order",
          actions: [
            { type: "ADD_RISK_SCORE", params: { value: 35 } },
            { type: "FLAG_SIGNAL", params: { signal: "comanda-guest" } },
          ],
        }),
        rule({
          key: "address-mismatch",
          conditions: { type: "condition", fact: "order.addressMismatch", operator: "isTrue" },
          actions: [
            { type: "ADD_RISK_SCORE", params: { value: 25 } },
            { type: "FLAG_SIGNAL", params: { signal: "adrese-diferite" } },
          ],
        }),
      ]),
      facts: mismatchedFacts(),
    });

    expect(result.riskScore).toBe(60);
    expect(result.riskLevel).toBe("HIGH");
    expect(result.decision).toBe("REVIEW");
    expect(result.decisionSource).toBe("score");
    expect(result.flaggedSignals).toEqual(
      expect.arrayContaining(["comanda-guest", "adrese-diferite"]),
    );
    expect(result.matchedRules).toHaveLength(2);
  });

  it("o regula poate FIXA decizia, peste praguri", () => {
    const result = assessFraud({
      snapshot: snapshot([
        rule({ key: "risky", actions: [{ type: "ADD_RISK_SCORE", params: { value: 95 } }] }),
        rule({
          key: "vip-allow",
          priority: 1000,
          conditions: { type: "condition", fact: "customer.loyaltyTier", operator: "eq", value: "VIP" },
          actions: [{ type: "SET_FRAUD_DECISION", params: { decision: "ALLOW" } }],
        }),
      ]),
      facts: facts({ customer: { loyaltyTier: "VIP", completedOrders: 30 } }),
    });

    // the score stays high, but the allowlist decides
    expect(result.riskScore).toBe(95);
    expect(result.decision).toBe("ALLOW");
    expect(result.decisionSource).toBe("rule");
  });

  it("o blocare fara scor este raportata ca risc critic", () => {
    const result = assessFraud({
      snapshot: snapshot([
        rule({
          key: "tara-interzisa",
          conditions: {
            type: "condition",
            fact: "order.shippingCountry",
            operator: "eq",
            value: "RO",
          },
          actions: [{ type: "SET_FRAUD_DECISION", params: { decision: "BLOCK" } }],
        }),
      ]),
      facts: facts(),
    });
    expect(result.riskScore).toBe(0);
    expect(result.decision).toBe("BLOCK");
    expect(result.riskLevel).toBe("CRITICAL");
  });

  it("blocheaza pe semnal de viteza", () => {
    const result = assessFraud({
      snapshot: snapshot([
        rule({
          key: "velocity",
          conditions: { type: "condition", fact: "session.ordersLastHour", operator: "gte", value: 5 },
          actions: [{ type: "SET_FRAUD_DECISION", params: { decision: "BLOCK" } }],
        }),
      ]),
      facts: fastOrdersFacts(),
    });
    expect(result.decision).toBe("BLOCK");
  });

  it("respecta pragurile personalizate ale rulesetului", () => {
    const result = assessFraud({
      snapshot: snapshot(
        [rule({ key: "guest", actions: [{ type: "ADD_RISK_SCORE", params: { value: 12 } }] })],
        { thresholds: { challenge: 10, review: 20, block: 30 } },
      ),
      facts: facts(),
    });
    expect(result.riskScore).toBe(12);
    expect(result.decision).toBe("CHALLENGE");
  });

  it("nicio regula potrivita => ALLOW, fara semnale", () => {
    const result = assessFraud({
      snapshot: snapshot([
        rule({
          key: "only-authenticated",
          conditions: { type: "condition", fact: "session.isAuthenticated", operator: "isTrue" },
        }),
      ]),
      facts: facts(),
    });
    expect(result.decision).toBe("ALLOW");
    expect(result.decisionSource).toBe("default");
    expect(result.matchedRules).toEqual([]);
  });
});
