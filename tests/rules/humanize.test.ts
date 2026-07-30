import { describe, expect, it } from "vitest";
import { humanizeAction, humanizeConditions, humanizeRule } from "@/lib/rules/humanize";
import { formatMoney } from "@/lib/utils/money";
import type { ConditionNode } from "@/lib/engine";

describe("acordul gramatical al condițiilor", () => {
  it("acordă predicatul cu forma faptului", () => {
    const feminine: ConditionNode = {
      type: "condition",
      fact: "order.shippingCountry",
      operator: "eq",
      value: "RO",
    };
    expect(humanizeConditions(feminine)).toBe(
      "țara de livrare este egală cu „RO”",
    );

    const masculine: ConditionNode = {
      type: "condition",
      fact: "product.basePriceCents",
      operator: "gte",
      value: 25000,
    };
    expect(humanizeConditions(masculine)).toBe(
      `prețul de bază este mai mare sau egal cu ${formatMoney(25000)}`,
    );

    const plural: ConditionNode = {
      type: "condition",
      fact: "session.ordersLastHour",
      operator: "gte",
      value: 5,
    };
    expect(humanizeConditions(plural)).toBe(
      "comenzi în ultima oră sunt mai mari sau egale cu 5",
    );
  });

  it("faptele booleene se citesc ca afirmații, fără „este adevărat”", () => {
    expect(
      humanizeConditions({
        type: "condition",
        fact: "order.addressMismatch",
        operator: "isTrue",
      }),
    ).toBe("adresa de livrare diferă de facturare");

    expect(
      humanizeConditions({
        type: "condition",
        fact: "session.isAuthenticated",
        operator: "isFalse",
      }),
    ).toBe("NU este autentificat");
  });

  it("valorile primesc unitatea potrivită", () => {
    expect(
      humanizeConditions({
        type: "condition",
        fact: "cart.weightGrams",
        operator: "gt",
        value: 10000,
      }),
    ).toContain("10.000 g");

    expect(
      humanizeConditions({
        type: "condition",
        fact: "session.accountAgeDays",
        operator: "lt",
        value: 1,
      }),
    ).toContain("1 zi");
  });

  it("grupurile se leagă cu ȘI / SAU", () => {
    const node: ConditionNode = {
      type: "group",
      op: "OR",
      children: [
        { type: "condition", fact: "session.isGuest", operator: "isTrue" },
        {
          type: "condition",
          fact: "customer.loyaltyTier",
          operator: "eq",
          value: "VIP",
        },
      ],
    };
    expect(humanizeConditions(node)).toBe(
      "este vizitator SAU nivelul de loialitate este egal cu „VIP”",
    );
  });

  it("valorile lipsă apar ca substituent, nu ca 0 sau undefined", () => {
    const text = humanizeConditions({
      type: "condition",
      fact: "product.basePriceCents",
      operator: "eq",
    });
    expect(text).toContain("…");
    expect(text).not.toContain("undefined");
  });
});

describe("frazarea acțiunilor", () => {
  it("acoperă toate categoriile, fără nume tehnice de parametri", () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ["SET_DISCOUNT_PERCENT", { value: 15 }, "aplică o reducere de 15%"],
      [
        "SET_PRICE_OVERRIDE",
        { priceCents: 9900 },
        `fixează prețul la ${formatMoney(9900)}`,
      ],
      ["ADD_PRICE_BADGE", { badge: "PROMO" }, "afișează badge-ul „PROMO”"],
      ["FREE_SHIPPING", {}, "livrarea este gratuită"],
      [
        "DISABLE_SHIPPING_METHOD",
        { method: "curier-express" },
        "dezactivează metoda „curier-express”",
      ],
      ["SET_SHIPPING_ETA", { minDays: 1, maxDays: 3 }, "estimează livrarea în 1–3 zile"],
      ["ADD_RISK_SCORE", { value: 40 }, "adaugă 40 la scorul de risc"],
      ["SET_FRAUD_DECISION", { decision: "BLOCK" }, "blochează comanda"],
      [
        "SET_FRAUD_DECISION",
        { decision: "REVIEW" },
        "trimite comanda la verificare manuală",
      ],
      ["FLAG_SIGNAL", { signal: "adrese-diferite" }, "marchează semnalul „adrese-diferite”"],
      ["HIDE_PRODUCT", {}, "ascunde produsul din catalog"],
      ["LIMIT_QUANTITY", { maxQuantity: 2 }, "limitează la 2 bucăți per comandă"],
      ["GRANT_BONUS_POINTS", { points: 100 }, "acordă 100 puncte bonus"],
      ["SET_BANNER", { message: "Black Friday" }, "afișează bannerul „Black Friday”"],
    ];

    for (const [type, params, expected] of cases) {
      expect(humanizeAction({ type, params })).toBe(expected);
    }
  });

  it("nu lasă niciodată „undefined” pentru parametri necompletați", () => {
    expect(humanizeAction({ type: "SET_DISCOUNT_PERCENT", params: {} })).toBe(
      "aplică o reducere de …%",
    );
    expect(humanizeAction({ type: "ADD_PRICE_BADGE", params: {} })).toBe(
      "afișează badge-ul …",
    );
  });
});

describe("humanizeRule", () => {
  it("compune regula completă", () => {
    const text = humanizeRule(
      {
        type: "group",
        op: "AND",
        children: [
          {
            type: "condition",
            fact: "product.category",
            operator: "eq",
            value: "gaming",
          },
          {
            type: "condition",
            fact: "customer.completedOrders",
            operator: "gte",
            value: 3,
          },
        ],
      },
      [
        { type: "SET_DISCOUNT_PERCENT", params: { value: 20 } },
        { type: "ADD_PRICE_BADGE", params: { badge: "GAMING" } },
      ],
    );

    expect(text.if).toBe(
      "categoria produsului este egală cu „gaming” ȘI comenzile finalizate sunt mai mari sau egale cu 3",
    );
    expect(text.then).toBe(
      "aplică o reducere de 20% + afișează badge-ul „GAMING”",
    );
  });
});
