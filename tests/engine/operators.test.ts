import { describe, expect, it } from "vitest";
import { getOperator, operatorsForFactType } from "@/lib/engine/operators";

function test(op: string, actual: unknown, expected?: unknown): boolean {
  const def = getOperator(op);
  if (!def) throw new Error(`missing operator ${op}`);
  return def.test(actual, expected);
}

describe("operatori de egalitate", () => {
  it("eq compara strict", () => {
    expect(test("eq", "RO", "RO")).toBe(true);
    expect(test("eq", 5, 5)).toBe(true);
    expect(test("eq", 5, "5")).toBe(false); // fara coercitie silentioasa
    expect(test("neq", "RO", "DE")).toBe(true);
  });

  it("eq accepta date in reprezentari diferite", () => {
    expect(test("eq", new Date("2026-01-01T00:00:00Z"), "2026-01-01T00:00:00Z")).toBe(true);
  });
});

describe("operatori numerici si temporali", () => {
  it("comparatii numerice", () => {
    expect(test("gt", 10, 5)).toBe(true);
    expect(test("gte", 5, 5)).toBe(true);
    expect(test("lt", 3, 5)).toBe(true);
    expect(test("lte", 6, 5)).toBe(false);
  });

  it("between este inclusiv", () => {
    expect(test("between", 5, [5, 10])).toBe(true);
    expect(test("between", 10, [5, 10])).toBe(true);
    expect(test("between", 11, [5, 10])).toBe(false);
    expect(test("between", 5, [10])).toBe(false); // lista invalida => false
  });

  it("comparatii pe date ISO", () => {
    expect(test("gt", "2026-06-01", "2026-01-01")).toBe(true);
    expect(test("lt", new Date("2026-01-01"), "2026-06-01")).toBe(true);
  });

  it("tipuri incompatibile => false, nu exceptie", () => {
    expect(test("gt", "abc", 5)).toBe(false);
    expect(test("gt", null, 5)).toBe(false);
    expect(test("gt", undefined, 5)).toBe(false);
  });
});

describe("apartenenta si text", () => {
  it("in / notIn", () => {
    expect(test("in", "RO", ["RO", "MD"])).toBe(true);
    expect(test("notIn", "DE", ["RO", "MD"])).toBe(true);
    expect(test("in", "DE", "RO")).toBe(false); // valoarea nu e lista
  });

  it("contains pe string este case-insensitive", () => {
    expect(test("contains", "Laptop Gaming ASUS", "gaming")).toBe(true);
    expect(test("notContains", "Laptop", "telefon")).toBe(true);
  });

  it("contains pe array", () => {
    expect(test("contains", ["sale", "new"], "sale")).toBe(true);
    expect(test("containsAny", ["sale", "new"], ["clearance", "new"])).toBe(true);
    expect(test("containsAll", ["sale", "new"], ["sale", "new"])).toBe(true);
    expect(test("containsAll", ["sale"], ["sale", "new"])).toBe(false);
  });

  it("startsWith / endsWith", () => {
    expect(test("startsWith", "SKU-1234", "sku-")).toBe(true);
    expect(test("endsWith", "foo@yahoo.com", "@yahoo.com")).toBe(true);
  });
});

describe("operatori unari", () => {
  it("exists / notExists", () => {
    expect(test("exists", 0)).toBe(true);
    expect(test("exists", "")).toBe(true);
    expect(test("exists", null)).toBe(false);
    expect(test("notExists", undefined)).toBe(true);
  });

  it("isTrue / isFalse sunt stricte", () => {
    expect(test("isTrue", true)).toBe(true);
    expect(test("isTrue", 1)).toBe(false);
    expect(test("isFalse", false)).toBe(true);
    expect(test("isFalse", 0)).toBe(false);
  });
});

describe("compatibilitate operatori <-> tip de fact", () => {
  it("expune doar operatori compatibili pentru editor", () => {
    const numberOps = operatorsForFactType("number").map((o) => o.id);
    expect(numberOps).toContain("gte");
    expect(numberOps).not.toContain("startsWith");

    const stringOps = operatorsForFactType("string").map((o) => o.id);
    expect(stringOps).toContain("contains");
    expect(stringOps).not.toContain("gt");
  });
});
