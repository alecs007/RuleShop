import { describe, expect, it } from "vitest";
import {
  catalogHref,
  countActiveFilters,
  hasActiveFilters,
  parseCatalogSelection,
  toggleValue,
  DEFAULT_SORT,
  EMPTY_SELECTION,
} from "../src/catalog-params";

describe("parseCatalogSelection", () => {
  it("fara parametri intoarce selectia goala", () => {
    expect(parseCatalogSelection({})).toEqual(EMPTY_SELECTION);
  });

  it("citeste listele si ca valori repetate si ca lista cu virgula", () => {
    const commas = parseCatalogSelection({ category: "audio,gaming" });
    const repeated = parseCatalogSelection({ category: ["audio", "gaming"] });
    expect(commas.categories).toEqual(["audio", "gaming"]);
    expect(repeated.categories).toEqual(["audio", "gaming"]);
  });

  it("elimina duplicatele si spatiile din liste", () => {
    const selection = parseCatalogSelection({ tag: " wireless , wireless,, 5g " });
    expect(selection.tags).toEqual(["wireless", "5g"]);
  });

  it("ordoneaza intervalul de preț dat invers", () => {
    const selection = parseCatalogSelection({ min: "300", max: "100" });
    expect(selection).toMatchObject({ minPrice: 100, maxPrice: 300 });
  });

  it("ignora pragurile de preț invalide", () => {
    expect(parseCatalogSelection({ min: "abc", max: "-5" })).toMatchObject({
      minPrice: null,
      maxPrice: null,
    });
  });

  it("cade pe sortarea implicita si pagina 1 cand valorile nu sunt valide", () => {
    const selection = parseCatalogSelection({ sort: "random", page: "0" });
    expect(selection.sort).toBe(DEFAULT_SORT);
    expect(selection.page).toBe(1);
  });

  it("citeste comutatoarele si accepta URLSearchParams", () => {
    const selection = parseCatalogSelection(
      new URLSearchParams("stock=1&new=1&brand=Vertex&brand=Nova&sort=price-asc"),
    );
    expect(selection).toMatchObject({
      inStockOnly: true,
      newOnly: true,
      brands: ["Vertex", "Nova"],
      sort: "price-asc",
    });
  });
});

describe("catalogHref", () => {
  it("nu pune in URL valorile implicite", () => {
    expect(catalogHref(EMPTY_SELECTION)).toBe("/products");
    expect(catalogHref({ ...EMPTY_SELECTION, sort: DEFAULT_SORT, page: 1 })).toBe(
      "/products",
    );
  });

  it("face drum dus-intors prin parse", () => {
    const selection = {
      ...EMPTY_SELECTION,
      q: "telefon",
      categories: ["telefoane", "gaming"],
      brands: ["Vertex"],
      tags: ["5g"],
      minPrice: 100,
      maxPrice: 5000,
      inStockOnly: true,
      newOnly: true,
      sort: "price-desc" as const,
      page: 3,
    };
    const href = catalogHref(selection);
    expect(parseCatalogSelection(new URLSearchParams(href.split("?")[1]))).toEqual(
      selection,
    );
  });
});

describe("countActiveFilters", () => {
  it("numara intervalul de preț o singura data si ignora căutarea", () => {
    const selection = {
      ...EMPTY_SELECTION,
      q: "telefon",
      categories: ["audio"],
      tags: ["5g", "wireless"],
      minPrice: 100,
      maxPrice: 500,
      inStockOnly: true,
    };
    expect(countActiveFilters(selection)).toBe(5);
    expect(countActiveFilters({ ...EMPTY_SELECTION, q: "telefon" })).toBe(0);
    expect(hasActiveFilters({ ...EMPTY_SELECTION, q: "telefon" })).toBe(true);
  });
});

describe("toggleValue", () => {
  it("adauga si scoate valori pastrand ordinea", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
});
