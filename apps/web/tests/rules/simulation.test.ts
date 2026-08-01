import { describe, expect, it } from "vitest";
import type {
  ConditionNode,
  EngineRule,
  RuleSetSnapshot,
} from "@ruleshop/rule-engine";
import {
  compareSnapshots,
  simulateSnapshot,
  type SimulationEvent,
} from "@/lib/rules/simulation";

function rule(
  key: string,
  conditions: ConditionNode,
  actions: EngineRule["actions"],
  priority = 100,
): EngineRule {
  return { key, name: key, priority, enabled: true, conditions, actions };
}

function snapshot(
  category: RuleSetSnapshot["category"],
  rules: EngineRule[],
  overrides: Partial<RuleSetSnapshot> = {},
): RuleSetSnapshot {
  return {
    key: category.toLowerCase(),
    category,
    version: 2,
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    defaultDecision: {},
    rules,
    ...overrides,
  };
}

const categoryIs = (value: string): ConditionNode => ({
  type: "condition",
  fact: "product.category",
  operator: "eq",
  value,
});

/** Un eveniment de PRICING pentru un produs dintr-o categorie, la un pret dat. */
function pricingEvent(category: string, basePriceCents: number): SimulationEvent {
  return {
    context: {
      product: { id: "p", category, basePriceCents, stock: 5, tags: [] },
      customer: { loyaltyTier: "STANDARD" },
      session: { isGuest: true },
    },
  };
}

describe("simulateSnapshot — statistici per regula", () => {
  it("numara potrivirile si aplicarile fiecarei reguli", () => {
    const snap = snapshot("PRICING", [
      rule("audio-10", categoryIs("audio"), [
        { type: "SET_DISCOUNT_PERCENT", params: { value: 10 } },
      ]),
      rule("gaming-20", categoryIs("gaming"), [
        { type: "SET_DISCOUNT_PERCENT", params: { value: 20 } },
      ]),
    ]);
    const events = [
      pricingEvent("audio", 10000),
      pricingEvent("audio", 20000),
      pricingEvent("gaming", 30000),
      pricingEvent("carti", 5000),
    ];

    const metrics = simulateSnapshot(snap, events);

    expect(metrics.evaluations).toBe(4);
    expect(metrics.matchedEvaluations).toBe(3);
    expect(metrics.usedDefault).toBe(1);
    expect(metrics.perRule["audio-10"]).toEqual({ matched: 2, applied: 2 });
    expect(metrics.perRule["gaming-20"]).toEqual({ matched: 1, applied: 1 });
  });

  it("sub PRIORITY_FIRST_MATCH, regula invinsa e potrivita dar neaplicata", () => {
    const snap = snapshot(
      "PRICING",
      [
        rule("mare", categoryIs("audio"), [
          { type: "SET_DISCOUNT_PERCENT", params: { value: 20 } },
        ], 500),
        rule("mic", categoryIs("audio"), [
          { type: "SET_DISCOUNT_PERCENT", params: { value: 5 } },
        ], 100),
      ],
      { conflictStrategy: "PRIORITY_FIRST_MATCH" },
    );

    const metrics = simulateSnapshot(snap, [pricingEvent("audio", 10000)]);

    expect(metrics.perRule["mare"]).toEqual({ matched: 1, applied: 1 });
    expect(metrics.perRule["mic"]).toEqual({ matched: 1, applied: 0 });
  });
});

describe("simulateSnapshot — agregate pe categorii", () => {
  it("PRICING: pondere si valoare medie a reducerilor", () => {
    const snap = snapshot("PRICING", [
      rule("audio-10", categoryIs("audio"), [
        { type: "SET_DISCOUNT_PERCENT", params: { value: 10 } },
      ]),
    ]);
    const events = [
      pricingEvent("audio", 10000), // -10% => 1000 bani reducere
      pricingEvent("carti", 10000), // fara reducere
    ];

    const { aggregates } = simulateSnapshot(snap, events);

    expect(aggregates.discountedEvaluations).toBe(1);
    expect(aggregates.discountedShare).toBe(50);
    expect(aggregates.avgDiscountPercent).toBe(10);
    expect(aggregates.avgDiscountCents).toBe(1000);
    expect(aggregates.totalDiscountCents).toBe(1000);
  });

  it("FRAUD: distributia deciziilor din scor si praguri", () => {
    const snap = snapshot(
      "FRAUD",
      [
        rule("scor-mare", {
          type: "condition",
          fact: "order.totalCents",
          operator: "gte",
          value: 100000,
        }, [{ type: "ADD_RISK_SCORE", params: { value: 90 } }]),
      ],
      {
        defaultDecision: {
          riskScore: 0,
          signals: [],
          thresholds: { challenge: 30, review: 55, block: 80 },
        },
      },
    );
    const fraudEvent = (totalCents: number): SimulationEvent => ({
      context: {
        cart: { subtotalCents: totalCents, itemCount: 1, categories: [], weightGrams: 0 },
        customer: {},
        session: { isGuest: true },
        order: { totalCents },
      },
    });

    const { aggregates } = simulateSnapshot(snap, [
      fraudEvent(150000), // scor 90 => BLOCK
      fraudEvent(1000), // scor 0 => ALLOW
    ]);

    expect(aggregates.blockCount).toBe(1);
    expect(aggregates.allowCount).toBe(1);
    expect(aggregates.blockedShare).toBe(50);
    expect(aggregates.avgRiskScore).toBe(45);
  });

  it("AVAILABILITY: numara blocarile, ascunderile si plafoanele", () => {
    const snap = snapshot("AVAILABILITY", [
      rule("ascunde-audio", categoryIs("audio"), [
        { type: "HIDE_PRODUCT", params: {} },
      ]),
      rule("plafon-gaming", categoryIs("gaming"), [
        { type: "LIMIT_QUANTITY", params: { maxQuantity: 2 } },
      ]),
    ]);

    const { aggregates } = simulateSnapshot(snap, [
      pricingEvent("audio", 10000),
      pricingEvent("gaming", 10000),
      pricingEvent("carti", 10000),
    ]);

    expect(aggregates.hiddenCount).toBe(1);
    expect(aggregates.blockedCount).toBe(1); // HIDE seteaza si available=false
    expect(aggregates.limitedCount).toBe(1);
  });
});

describe("compareSnapshots", () => {
  it("candidatul se compara cu versiunea activa pe aceleasi evenimente", () => {
    const active = snapshot("PRICING", []);
    const candidate = snapshot("PRICING", [
      rule("audio-10", categoryIs("audio"), [
        { type: "SET_DISCOUNT_PERCENT", params: { value: 10 } },
      ]),
    ]);
    const events = [pricingEvent("audio", 10000), pricingEvent("audio", 30000)];

    const comparison = compareSnapshots(active, candidate, events);

    expect(comparison.events).toBe(2);
    expect(comparison.active?.aggregates.totalDiscountCents).toBe(0);
    expect(comparison.candidate.aggregates.totalDiscountCents).toBe(4000);
    expect(comparison.aggregateDeltas.totalDiscountCents).toBe(4000);
  });

  it("fara versiune activa, comparatia are doar candidatul", () => {
    const candidate = snapshot("PRICING", []);
    const comparison = compareSnapshots(null, candidate, [
      pricingEvent("audio", 10000),
    ]);

    expect(comparison.active).toBeNull();
    expect(comparison.aggregateDeltas).toEqual({});
  });
});
