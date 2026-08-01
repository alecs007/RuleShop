import { describe, expect, it } from "vitest";
import type { RuleSetSnapshot } from "@ruleshop/rule-engine";
import { snapshotChecksum } from "@/lib/rules/checksum";

const base: RuleSetSnapshot = {
  key: "pricing",
  category: "PRICING",
  version: 1,
  conflictStrategy: "BEST_FOR_CUSTOMER",
  defaultDecision: {},
  rules: [
    {
      key: "vip",
      name: "VIP",
      priority: 500,
      enabled: true,
      conditions: {
        type: "condition",
        fact: "customer.loyaltyTier",
        operator: "eq",
        value: "VIP",
      },
      actions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 10 } }],
    },
  ],
};

describe("snapshotChecksum", () => {
  it("ignoră numărul de versiune — altfel publicarea fără modificări nu ar putea fi detectată", () => {
    expect(snapshotChecksum({ ...base, version: 7 })).toBe(
      snapshotChecksum({ ...base, version: 1 }),
    );
  });

  it("se schimbă când se schimbă o regulă", () => {
    const changed: RuleSetSnapshot = {
      ...base,
      rules: [
        {
          ...base.rules[0]!,
          actions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 15 } }],
        },
      ],
    };
    expect(snapshotChecksum(changed)).not.toBe(snapshotChecksum(base));
  });

  it("se schimbă când se schimbă strategia de conflict sau decizia implicită", () => {
    expect(
      snapshotChecksum({ ...base, conflictStrategy: "PRIORITY_FIRST_MATCH" }),
    ).not.toBe(snapshotChecksum(base));
    expect(
      snapshotChecksum({ ...base, defaultDecision: { discountPercent: 0 } }),
    ).not.toBe(snapshotChecksum(base));
  });

  it("este stabil pentru același conținut", () => {
    expect(snapshotChecksum(base)).toBe(snapshotChecksum({ ...base }));
  });
});
