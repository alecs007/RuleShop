import { describe, expect, it } from "vitest";
import type { ConditionNode, EngineRule, RuleSetSnapshot } from "@/lib/engine/types";
import {
  basePointsFor,
  computeLoyalty,
  explainLoyalty,
  MAX_POINTS_MULTIPLIER,
  pointsLabel,
  type ActorFacts,
  type LoyaltyComputation,
} from "@/lib/shop/loyalty-view";

const CART = {
  subtotalCents: 30000, // 300 lei => 300 puncte de baza
  itemCount: 2,
  weightGrams: 1500,
  categories: ["audio"],
};

const VIP: ActorFacts = {
  customer: { loyaltyTier: "VIP", loyaltyPoints: 5000, completedOrders: 20 },
  session: { isGuest: false, isAuthenticated: true },
};

const CLIENT: ActorFacts = {
  customer: { loyaltyTier: "STANDARD", loyaltyPoints: 100, completedOrders: 2 },
  session: { isGuest: false, isAuthenticated: true },
};

const GUEST: ActorFacts = {
  customer: { loyaltyTier: "STANDARD", loyaltyPoints: 0, completedOrders: 0 },
  session: { isGuest: true, isAuthenticated: false },
};

function rule(
  key: string,
  conditions: ConditionNode,
  actions: EngineRule["actions"],
  priority = 100,
): EngineRule {
  return { key, name: key, priority, enabled: true, conditions, actions };
}

function snapshot(
  rules: EngineRule[],
  overrides: Partial<RuleSetSnapshot> = {},
): RuleSetSnapshot {
  return {
    key: "loyalty",
    category: "LOYALTY",
    version: 4,
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    defaultDecision: { pointsMultiplier: 1, bonusPoints: 0, benefits: [] },
    rules,
    ...overrides,
  };
}

const tierIs = (tier: string): ConditionNode => ({
  type: "condition",
  fact: "customer.loyaltyTier",
  operator: "eq",
  value: tier,
});

const subtotalOver = (cents: number): ConditionNode => ({
  type: "condition",
  fact: "cart.subtotalCents",
  operator: "gte",
  value: cents,
});

const always: ConditionNode = {
  type: "condition",
  fact: "cart.subtotalCents",
  operator: "gte",
  value: 0,
};

function view(
  snap: RuleSetSnapshot | null,
  extra: Partial<LoyaltyComputation> = {},
) {
  return computeLoyalty({ snapshot: snap, cart: CART, actor: CLIENT, ...extra });
}

describe("basePointsFor", () => {
  it("acordă un punct pentru fiecare unitate de monedă, rotunjit în jos", () => {
    expect(basePointsFor(0)).toBe(0);
    expect(basePointsFor(99)).toBe(0);
    expect(basePointsFor(100)).toBe(1);
    expect(basePointsFor(30000)).toBe(300);
    expect(basePointsFor(30099)).toBe(300);
  });

  it("nu acordă puncte negative pentru sume negative", () => {
    expect(basePointsFor(-500)).toBe(0);
  });
});

describe("computeLoyalty — comportament implicit", () => {
  it("fără ruleset publicat acordă punctele de bază, nu zero", () => {
    const result = view(null);
    expect(result.usedDefaults).toBe(true);
    expect(result.basePoints).toBe(300);
    expect(result.points).toBe(300);
    expect(result.pointsMultiplier).toBe(1);
    expect(result.extraPoints).toBe(0);
    expect(result.benefits).toEqual([]);
    expect(result.matchedRules).toEqual([]);
  });

  it("kill switch-ul oprește bonusurile, dar nu punctele de bază", () => {
    const snap = snapshot([
      rule("dublu", always, [{ type: "SET_POINTS_MULTIPLIER", params: { factor: 2 } }]),
    ]);
    const result = view(snap, { killSwitch: true });
    expect(result.usedDefaults).toBe(true);
    expect(result.points).toBe(300);
    expect(result.rulesetVersion).toBe(4);
  });

  it("nivelul implicit este cel al contului", () => {
    expect(view(null, { actor: VIP }).tier).toBe("VIP");
    expect(view(null, { actor: GUEST }).tier).toBe("STANDARD");
    // Cont fara nivel setat => nivelul implicit, nu undefined.
    expect(
      view(null, {
        actor: { customer: {}, session: { isAuthenticated: true } },
      }).tier,
    ).toBe("STANDARD");
  });
});

describe("computeLoyalty — acțiuni", () => {
  it("multiplică punctele de bază", () => {
    const snap = snapshot([
      rule("vip-dublu", tierIs("VIP"), [
        { type: "SET_POINTS_MULTIPLIER", params: { factor: 2 } },
      ]),
    ]);
    const result = view(snap, { actor: VIP });
    expect(result.pointsMultiplier).toBe(2);
    expect(result.points).toBe(600);
    expect(result.extraPoints).toBe(300);
    expect(result.matchedRules).toEqual(["vip-dublu"]);
  });

  it("nu multiplică pentru un client care nu se potrivește", () => {
    const snap = snapshot([
      rule("vip-dublu", tierIs("VIP"), [
        { type: "SET_POINTS_MULTIPLIER", params: { factor: 2 } },
      ]),
    ]);
    const result = view(snap, { actor: CLIENT });
    expect(result.points).toBe(300);
    expect(result.matchedRules).toEqual([]);
  });

  it("adaugă bonusul PESTE punctele multiplicate", () => {
    const snap = snapshot([
      rule("dublu", always, [{ type: "SET_POINTS_MULTIPLIER", params: { factor: 2 } }]),
      rule("bonus", subtotalOver(20000), [
        { type: "GRANT_BONUS_POINTS", params: { points: 50 } },
      ]),
    ]);
    const result = view(snap);
    expect(result.bonusPoints).toBe(50);
    expect(result.points).toBe(300 * 2 + 50);
  });

  it("cumulează punctele bonus din mai multe reguli", () => {
    const snap = snapshot([
      rule("bonus-a", always, [{ type: "GRANT_BONUS_POINTS", params: { points: 20 } }]),
      rule("bonus-b", subtotalOver(10000), [
        { type: "GRANT_BONUS_POINTS", params: { points: 30 } },
      ]),
    ]);
    expect(view(snap).bonusPoints).toBe(50);
  });

  it("colectează beneficiile fără duplicate", () => {
    const snap = snapshot([
      rule("retur", always, [
        { type: "GRANT_BENEFIT", params: { benefit: "retur extins 60 de zile" } },
      ]),
      rule("retur-din-nou", subtotalOver(10000), [
        { type: "GRANT_BENEFIT", params: { benefit: "retur extins 60 de zile" } },
        { type: "GRANT_BENEFIT", params: { benefit: "suport prioritar" } },
      ]),
    ]);
    expect(view(snap).benefits).toEqual([
      "retur extins 60 de zile",
      "suport prioritar",
    ]);
  });

  it("nivelul impus de o regulă înlocuiește nivelul contului", () => {
    const snap = snapshot([
      rule("promovare", subtotalOver(20000), [
        { type: "SET_LOYALTY_TIER", params: { tier: "GOLD" } },
      ]),
    ]);
    const result = view(snap);
    expect(result.tier).toBe("GOLD");
    expect(result.tierFromRule).toBe(true);
  });
});

describe("computeLoyalty — robustețe", () => {
  it("plafonează multiplicatorul chiar dacă snapshotul conține o valoare absurdă", () => {
    const snap = snapshot([
      rule("greșeală", always, [
        { type: "SET_POINTS_MULTIPLIER", params: { factor: 100000 } },
      ]),
    ]);
    const result = view(snap);
    expect(result.pointsMultiplier).toBe(MAX_POINTS_MULTIPLIER);
    expect(result.points).toBe(300 * MAX_POINTS_MULTIPLIER);
  });

  it("ignoră valorile de decizie invalide și cade pe implicit", () => {
    const snap = snapshot([], {
      defaultDecision: {
        pointsMultiplier: "foarte mult",
        bonusPoints: -50,
        benefits: [1, "valid", ""],
        tier: "   ",
      },
    });
    const result = view(snap);
    expect(result.pointsMultiplier).toBe(1);
    expect(result.bonusPoints).toBe(0);
    expect(result.points).toBe(300);
    expect(result.benefits).toEqual(["valid"]);
    expect(result.tier).toBe("STANDARD");
    expect(result.tierFromRule).toBe(false);
  });

  it("un coș gol nu produce puncte", () => {
    const snap = snapshot([
      rule("dublu", always, [{ type: "SET_POINTS_MULTIPLIER", params: { factor: 2 } }]),
    ]);
    const result = computeLoyalty({
      snapshot: snap,
      cart: { subtotalCents: 0, itemCount: 0, weightGrams: 0, categories: [] },
      actor: CLIENT,
    });
    expect(result.points).toBe(0);
  });

  it("este determinist: același context dă același rezultat", () => {
    const snap = snapshot([
      rule("bonus", always, [{ type: "GRANT_BONUS_POINTS", params: { points: 10 } }]),
    ]);
    const a = view(snap);
    const b = view(snap);
    expect(a.points).toBe(b.points);
    expect(a.benefits).toEqual(b.benefits);
    expect(a.tier).toBe(b.tier);
  });
});

describe("creditabilitate", () => {
  it("un vizitator fără cont vede punctele, dar nu le poate acumula", () => {
    const result = view(null, { actor: GUEST });
    expect(result.points).toBe(300);
    expect(result.creditable).toBe(false);
  });

  it("un client autentificat le poate acumula", () => {
    expect(view(null, { actor: CLIENT }).creditable).toBe(true);
  });
});

describe("explicații", () => {
  it("acordă corect substantivul", () => {
    expect(pointsLabel(1)).toBe("1 punct");
    expect(pointsLabel(0)).toBe("0 puncte");
    expect(pointsLabel(300)).toBe("300 puncte");
  });

  it("descrie multiplicatorul și bonusul", () => {
    const snap = snapshot([
      rule("dublu", always, [
        { type: "SET_POINTS_MULTIPLIER", params: { factor: 2 } },
        { type: "GRANT_BONUS_POINTS", params: { points: 50 } },
      ]),
    ]);
    const text = explainLoyalty(view(snap));
    expect(text).toContain("300 puncte");
    expect(text).toContain("× 2");
    expect(text).toContain("50 puncte bonus");
  });

  it("spune explicit când nu se acumulează nimic", () => {
    const result = computeLoyalty({
      snapshot: null,
      cart: { subtotalCents: 0, itemCount: 0, weightGrams: 0, categories: [] },
      actor: CLIENT,
    });
    expect(explainLoyalty(result)).toContain("Nicio regulă activă");
  });
});
