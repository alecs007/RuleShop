import { describe, expect, it } from "vitest";
import type { ConditionNode, EngineRule, RuleSetSnapshot } from "@ruleshop/rule-engine";
import { computeShippingQuote } from "@/lib/shop/shipping-quote";
import type { ShippingMethod } from "@/lib/shop/shipping-methods";

const METHODS: ShippingMethod[] = [
  { id: "standard", label: "Curier standard", costCents: 1999, etaDaysMin: 2, etaDaysMax: 4, sortOrder: 1 },
  { id: "express", label: "Curier express", costCents: 3499, etaDaysMin: 1, etaDaysMax: 2, sortOrder: 2 },
  { id: "easybox", label: "Easybox", costCents: 1499, etaDaysMin: 2, etaDaysMax: 5, sortOrder: 3 },
];

const CART = {
  subtotalCents: 30000,
  itemCount: 2,
  weightGrams: 1500,
  categories: ["audio"],
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
    key: "shipping",
    category: "SHIPPING",
    version: 3,
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    defaultDecision: {},
    rules,
    ...overrides,
  };
}

/** Coș peste 250 lei. */
const subtotalOver = (cents: number): ConditionNode => ({
  type: "condition",
  fact: "cart.subtotalCents",
  operator: "gte",
  value: cents,
});

const methodIs = (id: string): ConditionNode => ({
  type: "condition",
  fact: "shipping.methodId",
  operator: "eq",
  value: id,
});

function quote(
  snap: RuleSetSnapshot | null,
  extra: Partial<Parameters<typeof computeShippingQuote>[0]> = {},
) {
  return computeShippingQuote({
    methods: METHODS,
    snapshot: snap,
    cart: CART,
    currency: "RON",
    ...extra,
  });
}

describe("computeShippingQuote — fara reguli", () => {
  it("fara ruleset publicat pastreaza costurile de lista", () => {
    const result = quote(null);

    expect(result.usedDefaults).toBe(true);
    expect(result.rulesetVersion).toBeNull();
    expect(result.options.map((o) => [o.id, o.costCents])).toEqual([
      ["standard", 1999],
      ["express", 3499],
      ["easybox", 1499],
    ]);
    // Ordinea de afisare e cea configurata; preselectata e cea mai ieftina.
    expect(result.cheapest?.id).toBe("easybox");
    expect(result.selected?.id).toBe("easybox");
  });

  it("kill switch activ ignora regulile publicate", () => {
    const snap = snapshot([
      rule("gratis", subtotalOver(10000), [{ type: "FREE_SHIPPING", params: {} }]),
    ]);

    const result = quote(snap, { killSwitch: true });

    expect(result.usedDefaults).toBe(true);
    expect(result.options.every((o) => o.costCents === o.baseCostCents)).toBe(true);
    expect(result.rulesetVersion).toBe(3);
  });
});

describe("computeShippingQuote — cost", () => {
  it("livrarea gratuita peste un prag se aplica tuturor metodelor", () => {
    const snap = snapshot([
      rule("gratis-250", subtotalOver(25000), [{ type: "FREE_SHIPPING", params: {} }]),
    ]);

    const result = quote(snap);

    expect(result.options.every((o) => o.free && o.costCents === 0)).toBe(true);
    expect(result.options[0]!.matchedRules).toEqual(["gratis-250"]);
    expect(result.rulesetVersion).toBe(3);
    expect(result.usedDefaults).toBe(false);
  });

  it("pragul nu se aplica sub valoare", () => {
    const snap = snapshot([
      rule("gratis-500", subtotalOver(50000), [{ type: "FREE_SHIPPING", params: {} }]),
    ]);

    const result = quote(snap);

    expect(result.options.every((o) => o.matchedRules.length === 0)).toBe(true);
    expect(result.selected?.costCents).toBe(1499);
  });

  it("o regula poate viza o singura metoda prin shipping.methodId", () => {
    const snap = snapshot([
      rule("express-redus", methodIs("express"), [
        { type: "SET_SHIPPING_COST", params: { costCents: 2000 } },
      ]),
    ]);

    const result = quote(snap);
    const byId = new Map(result.options.map((o) => [o.id, o]));

    expect(byId.get("express")!.costCents).toBe(2000);
    expect(byId.get("standard")!.costCents).toBe(1999);
    expect(byId.get("easybox")!.costCents).toBe(1499);
  });

  it("ordinea de afisare rămâne cea a magazinului, dar cea mai ieftina urmeaza costul", () => {
    const snap = snapshot([
      rule("express-gratis", methodIs("express"), [
        { type: "FREE_SHIPPING", params: {} },
      ]),
    ]);

    const result = quote(snap);

    expect(result.options.map((o) => o.id)).toEqual([
      "standard",
      "express",
      "easybox",
    ]);
    expect(result.cheapest?.id).toBe("express");
    expect(result.selected?.id).toBe("express");
  });

  it("prioritatea mai mare are ultimul cuvant pe acelasi camp", () => {
    const snap = snapshot([
      rule("gratis", subtotalOver(10000), [{ type: "FREE_SHIPPING", params: {} }], 100),
      rule(
        "taxa-fixa",
        subtotalOver(10000),
        [{ type: "SET_SHIPPING_COST", params: { costCents: 999 } }],
        500,
      ),
    ]);

    const result = quote(snap);

    expect(result.options.every((o) => o.costCents === 999)).toBe(true);
  });
});

describe("computeShippingQuote — disponibilitate", () => {
  it("o regula poate exclude o metoda, chiar daca alta modifica costul", () => {
    const snap = snapshot([
      rule("fara-express-la-greu", {
        type: "condition",
        fact: "cart.weightGrams",
        operator: "gte",
        value: 1000,
      }, [{ type: "DISABLE_SHIPPING_METHOD", params: { method: "express" } }]),
      rule("gratis", subtotalOver(10000), [{ type: "FREE_SHIPPING", params: {} }]),
    ]);

    const result = quote(snap);

    expect(result.options.map((o) => o.id)).toEqual(["standard", "easybox"]);
    expect(result.disabledOptions.map((o) => o.id)).toEqual(["express"]);
    expect(result.disabledOptions[0]!.disabled).toBe(true);
    // Restul metodelor beneficiaza in continuare de livrarea gratuita.
    expect(result.options.every((o) => o.free)).toBe(true);
  });

  it("metoda impusa exclude toate celelalte", () => {
    const snap = snapshot([
      rule("doar-magazin", subtotalOver(10000), [
        { type: "FORCE_SHIPPING_METHOD", params: { method: "easybox" } },
      ]),
    ]);

    const result = quote(snap);

    expect(result.forcedMethodId).toBe("easybox");
    expect(result.options.map((o) => o.id)).toEqual(["easybox"]);
    expect(result.disabledOptions.map((o) => o.id)).toEqual(["standard", "express"]);
    expect(result.selected?.id).toBe("easybox");
  });

  it("o metoda impusa inexistenta nu goleste lista", () => {
    const snap = snapshot([
      rule("metoda-stearsa", subtotalOver(10000), [
        { type: "FORCE_SHIPPING_METHOD", params: { method: "drona" } },
      ]),
    ]);

    const result = quote(snap);

    expect(result.forcedMethodId).toBeNull();
    expect(result.options).toHaveLength(3);
    expect(result.disabledOptions).toHaveLength(0);
  });

  it("toate metodele excluse => cotatie fara opțiuni", () => {
    const snap = snapshot([
      rule("blocheaza-tot", subtotalOver(10000), [
        { type: "DISABLE_SHIPPING_METHOD", params: { method: "standard" } },
        { type: "DISABLE_SHIPPING_METHOD", params: { method: "express" } },
        { type: "DISABLE_SHIPPING_METHOD", params: { method: "easybox" } },
      ]),
    ]);

    const result = quote(snap);

    expect(result.options).toHaveLength(0);
    expect(result.selected).toBeNull();
    expect(result.cheapest).toBeNull();
  });
});

describe("computeShippingQuote — estimare si alegerea clientului", () => {
  it("SET_SHIPPING_ETA suprascrie estimarea metodei", () => {
    const snap = snapshot([
      rule("livrare-lenta", subtotalOver(10000), [
        { type: "SET_SHIPPING_ETA", params: { minDays: 5, maxDays: 9 } },
      ]),
    ]);

    const result = quote(snap);

    expect(result.options.every((o) => o.etaDaysMin === 5 && o.etaDaysMax === 9)).toBe(
      true,
    );
  });

  it("alegerea clientului se pastreaza cand metoda e disponibila", () => {
    const result = quote(null, { selectedMethodId: "express" });

    expect(result.selected?.id).toBe("express");
    expect(result.selectionChanged).toBe(false);
    // Sugestia implicita ramane cea mai ieftina, independent de alegere.
    expect(result.cheapest?.id).toBe("easybox");
  });

  it("alegerea exclusa de o regula cade pe cea mai ieftina disponibila", () => {
    const snap = snapshot([
      rule("fara-express", subtotalOver(10000), [
        { type: "DISABLE_SHIPPING_METHOD", params: { method: "express" } },
      ]),
    ]);

    const result = quote(snap, { selectedMethodId: "express" });

    expect(result.selected?.id).toBe("easybox");
    expect(result.selectionChanged).toBe(true);
  });
});

describe("computeShippingQuote — faptele clientului", () => {
  it("regulile pot depinde de nivelul de loialitate", () => {
    const snap = snapshot([
      rule("vip-gratis", {
        type: "condition",
        fact: "customer.loyaltyTier",
        operator: "eq",
        value: "VIP",
      }, [{ type: "FREE_SHIPPING", params: {} }]),
    ]);

    const vip = quote(snap, {
      actor: {
        customer: { loyaltyTier: "VIP" },
        session: { isGuest: false, isAuthenticated: true },
      },
    });
    const guest = quote(snap);

    expect(vip.options.every((o) => o.free)).toBe(true);
    expect(guest.options.every((o) => o.costCents === o.baseCostCents)).toBe(true);
  });
});
