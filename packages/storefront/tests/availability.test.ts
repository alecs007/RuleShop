import { describe, expect, it } from "vitest";
import type {
  ConditionNode,
  EngineRule,
  RuleSetSnapshot,
} from "@ruleshop/rule-engine";
import {
  availabilityLabel,
  clampQuantity,
  computeAvailability,
  unavailableMessage,
  type ProductAvailabilityFacts,
} from "../src/availability";

function product(
  overrides: Partial<ProductAvailabilityFacts> = {},
): ProductAvailabilityFacts {
  return {
    id: "p1",
    sku: "SKU-1",
    name: "Căști wireless",
    category: "audio",
    brand: "Soundy",
    basePriceCents: 34900,
    stock: 20,
    tags: ["wireless"],
    ...overrides,
  };
}

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
    key: "availability",
    category: "AVAILABILITY",
    version: 5,
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    defaultDecision: { available: true, hidden: false },
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

const isGuest: ConditionNode = {
  type: "condition",
  fact: "session.isGuest",
  operator: "eq",
  value: true,
};

describe("computeAvailability — fara reguli", () => {
  it("fara ruleset publicat decide doar stocul", () => {
    const view = computeAvailability({ product: product(), snapshot: null });

    expect(view.available).toBe(true);
    expect(view.hidden).toBe(false);
    expect(view.maxPerOrder).toBe(20);
    expect(view.ruleLimit).toBeNull();
    expect(view.reason).toBe("in-stock");
    expect(view.usedDefaults).toBe(true);
    expect(view.rulesetVersion).toBeNull();
  });

  it("stocul 0 inseamna indisponibil", () => {
    const view = computeAvailability({
      product: product({ stock: 0 }),
      snapshot: null,
    });

    expect(view.available).toBe(false);
    expect(view.maxPerOrder).toBe(0);
    expect(view.reason).toBe("out-of-stock");
  });

  it("sub pragul implicit se semnaleaza „ultimele bucăți”", () => {
    const view = computeAvailability({
      product: product({ stock: 3 }),
      snapshot: null,
    });

    expect(view.lowStock).toBe(true);
    expect(view.reason).toBe("low-stock");
    expect(availabilityLabel(view)).toBe("Ultimele 3 bucăți");
  });

  it("plafonul absolut taie stocurile uriase", () => {
    const view = computeAvailability({
      product: product({ stock: 500 }),
      snapshot: null,
    });

    expect(view.maxPerOrder).toBe(99);
  });

  it("kill switch ignora regulile publicate", () => {
    const snap = snapshot([
      rule("blocheaza", categoryIs("audio"), [
        { type: "SET_AVAILABILITY", params: { available: false } },
      ]),
    ]);

    const view = computeAvailability({
      product: product(),
      snapshot: snap,
      killSwitch: true,
    });

    expect(view.available).toBe(true);
    expect(view.usedDefaults).toBe(true);
    expect(view.rulesetVersion).toBe(5);
  });
});

describe("computeAvailability — reguli", () => {
  it("SET_AVAILABILITY false blocheaza produsul desi are stoc", () => {
    const snap = snapshot([
      rule("indisponibil-audio", categoryIs("audio"), [
        { type: "SET_AVAILABILITY", params: { available: false } },
      ]),
    ]);

    const view = computeAvailability({ product: product(), snapshot: snap });

    expect(view.available).toBe(false);
    expect(view.hidden).toBe(false);
    expect(view.maxPerOrder).toBe(0);
    expect(view.reason).toBe("blocked-by-rule");
    expect(view.matchedRules).toEqual(["indisponibil-audio"]);
    expect(view.usedDefaults).toBe(false);
  });

  it("HIDE_PRODUCT scoate produsul din catalog", () => {
    const snap = snapshot([
      rule("ascunde", categoryIs("audio"), [
        { type: "HIDE_PRODUCT", params: {} },
      ]),
    ]);

    const view = computeAvailability({ product: product(), snapshot: snap });

    expect(view.hidden).toBe(true);
    expect(view.available).toBe(false);
    expect(view.reason).toBe("hidden-by-rule");
  });

  it("regulile nu pot inventa stoc", () => {
    const snap = snapshot([
      rule("forteaza", categoryIs("audio"), [
        { type: "SET_AVAILABILITY", params: { available: true } },
      ]),
    ]);

    const view = computeAvailability({
      product: product({ stock: 0 }),
      snapshot: snap,
    });

    expect(view.available).toBe(false);
    expect(view.reason).toBe("out-of-stock");
  });

  it("LIMIT_QUANTITY plafoneaza cantitatea per comanda", () => {
    const snap = snapshot([
      rule("max-2", categoryIs("audio"), [
        { type: "LIMIT_QUANTITY", params: { maxQuantity: 2 } },
      ]),
    ]);

    const view = computeAvailability({ product: product(), snapshot: snap });

    expect(view.available).toBe(true);
    expect(view.maxPerOrder).toBe(2);
    expect(view.ruleLimit).toBe(2);
  });

  it("plafonul de regula nu depaseste stocul", () => {
    const snap = snapshot([
      rule("max-50", categoryIs("audio"), [
        { type: "LIMIT_QUANTITY", params: { maxQuantity: 50 } },
      ]),
    ]);

    const view = computeAvailability({
      product: product({ stock: 3 }),
      snapshot: snap,
    });

    expect(view.maxPerOrder).toBe(3);
    expect(view.ruleLimit).toBe(50);
  });

  it("SET_LOW_STOCK_THRESHOLD schimba pragul de avertizare", () => {
    const snap = snapshot([
      rule("prag-10", categoryIs("audio"), [
        { type: "SET_LOW_STOCK_THRESHOLD", params: { threshold: 10 } },
      ]),
    ]);

    const view = computeAvailability({
      product: product({ stock: 8 }),
      snapshot: snap,
    });

    expect(view.lowStock).toBe(true);
    expect(view.lowStockThreshold).toBe(10);
  });

  it("badge-urile si mesajul se cumuleaza din mai multe reguli", () => {
    const snap = snapshot([
      rule("badge", categoryIs("audio"), [
        { type: "ADD_AVAILABILITY_BADGE", params: { badge: "PRECOMANDĂ" } },
      ]),
      rule(
        "mesaj",
        categoryIs("audio"),
        [
          {
            type: "SET_AVAILABILITY_MESSAGE",
            params: { message: "Se livrează din 10 august" },
          },
        ],
        500,
      ),
    ]);

    const view = computeAvailability({ product: product(), snapshot: snap });

    expect(view.badges).toEqual(["PRECOMANDĂ"]);
    expect(view.message).toBe("Se livrează din 10 august");
    expect(availabilityLabel(view)).toBe("Se livrează din 10 august");
    expect(view.matchedRules).toHaveLength(2);
  });

  it("regulile pot depinde de cine se uita (vizitator vs client)", () => {
    const snap = snapshot([
      rule("doar-clienti", isGuest, [
        { type: "SET_AVAILABILITY", params: { available: false } },
      ]),
    ]);

    // With no explicit actor, evaluation runs as a guest.
    const asGuest = computeAvailability({ product: product(), snapshot: snap });
    const asCustomer = computeAvailability({
      product: product(),
      snapshot: snap,
      actor: {
        customer: { loyaltyTier: "VIP", completedOrders: 12 },
        session: { isGuest: false, isAuthenticated: true },
      },
    });

    expect(asGuest.available).toBe(false);
    expect(asCustomer.available).toBe(true);
  });
});

describe("clampQuantity", () => {
  const snap = snapshot([
    rule("max-2", categoryIs("audio"), [
      { type: "LIMIT_QUANTITY", params: { maxQuantity: 2 } },
    ]),
  ]);

  it("cantitatea in limite trece neatinsa", () => {
    const view = computeAvailability({ product: product(), snapshot: snap });
    expect(clampQuantity(view, 2)).toEqual({ quantity: 2, limitedBy: null });
  });

  it("peste plafonul de regula, taie regula", () => {
    const view = computeAvailability({ product: product(), snapshot: snap });
    expect(clampQuantity(view, 5)).toEqual({ quantity: 2, limitedBy: "rule" });
  });

  it("peste stoc (fara reguli), taie stocul", () => {
    const view = computeAvailability({
      product: product({ stock: 4 }),
      snapshot: null,
    });
    expect(clampQuantity(view, 9)).toEqual({ quantity: 4, limitedBy: "stock" });
  });

  it("produs indisponibil inseamna cantitate 0", () => {
    const view = computeAvailability({
      product: product({ stock: 0 }),
      snapshot: null,
    });
    expect(clampQuantity(view, 3)).toEqual({ quantity: 0, limitedBy: "stock" });
  });
});

describe("mesaje pentru client", () => {
  it("mesajul regulii are prioritate in explicatia de indisponibilitate", () => {
    const snap = snapshot([
      rule("blocat-cu-mesaj", categoryIs("audio"), [
        { type: "SET_AVAILABILITY", params: { available: false } },
        {
          type: "SET_AVAILABILITY_MESSAGE",
          params: { message: "Disponibil din nou în septembrie" },
        },
      ]),
    ]);

    const view = computeAvailability({ product: product(), snapshot: snap });

    expect(unavailableMessage(view, "Căști wireless")).toBe(
      "Disponibil din nou în septembrie",
    );
  });

  it("fara mesaj de regula, explicatia numeste produsul", () => {
    const view = computeAvailability({
      product: product({ stock: 0 }),
      snapshot: null,
    });

    expect(unavailableMessage(view, "Căști wireless")).toBe(
      `„Căști wireless" nu mai este în stoc.`,
    );
  });
});
