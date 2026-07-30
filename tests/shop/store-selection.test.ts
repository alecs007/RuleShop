import { describe, expect, it } from "vitest";
import {
  buildAdminStoreOptions,
  resolveAdminStoreId,
} from "@/lib/shop/store-selection";
import { slugifyStoreName, storeSlugSchema } from "@/lib/shop/store-slug";

const STORES = [
  { id: "ro", active: true },
  { id: "de", active: true },
  { id: "closed", active: false },
];

describe("resolveAdminStoreId", () => {
  it("tine personalul pe magazinul din contul lui, orice ar cere cookie-ul", () => {
    // Esenta izolarii multi-tenant: un STORE_ADMIN nu isi poate schimba
    // magazinul setandu-si un cookie.
    for (const role of ["STORE_ADMIN", "OPERATOR"] as const) {
      expect(
        resolveAdminStoreId({
          role,
          pinnedStoreId: "ro",
          requestedStoreId: "de",
          stores: STORES,
          fallbackStoreId: "ro",
        }),
      ).toBe("ro");
    }
  });

  it("nu da drept de alegere personalului fara magazin in cont", () => {
    // Fara `storeId` nu inseamna „poate orice": cade pe magazinul activ.
    expect(
      resolveAdminStoreId({
        role: "OPERATOR",
        pinnedStoreId: null,
        requestedStoreId: "de",
        stores: STORES,
        fallbackStoreId: "ro",
      }),
    ).toBe("ro");
  });

  it("respecta selectia platformei", () => {
    expect(
      resolveAdminStoreId({
        role: "PLATFORM_ADMIN",
        pinnedStoreId: null,
        requestedStoreId: "de",
        stores: STORES,
        fallbackStoreId: "ro",
      }),
    ).toBe("de");
  });

  it("lasa platforma sa comute si cand contul a rămas cu un storeId", () => {
    // Un cont promovat din STORE_ADMIN pastreaza `storeId` in rand. Daca acela ar
    // avea prioritate, comutarea din panou n-ar avea niciun efect.
    expect(
      resolveAdminStoreId({
        role: "PLATFORM_ADMIN",
        pinnedStoreId: "ro",
        requestedStoreId: "de",
        stores: STORES,
        fallbackStoreId: "ro",
      }),
    ).toBe("de");
  });

  it("cade pe magazinul activ fara selectie", () => {
    expect(
      resolveAdminStoreId({
        role: "PLATFORM_ADMIN",
        pinnedStoreId: null,
        requestedStoreId: null,
        stores: STORES,
        fallbackStoreId: "ro",
      }),
    ).toBe("ro");
  });

  it("ignora un magazin oprit sau dispărut", () => {
    for (const requestedStoreId of ["closed", "sters"]) {
      expect(
        resolveAdminStoreId({
          role: "PLATFORM_ADMIN",
          pinnedStoreId: null,
          requestedStoreId,
          stores: STORES,
          fallbackStoreId: "ro",
        }),
      ).toBe("ro");
    }
  });
});

describe("buildAdminStoreOptions", () => {
  const OPTIONS = [
    { id: "ro", name: "RuleShop RO", slug: "ruleshop-ro", active: true },
    { id: "de", name: "RuleShop DE", slug: "ruleshop-de", active: true },
    { id: "closed", name: "Magazin oprit", slug: "magazin-oprit", active: false },
  ];

  it("ofera doar magazinele pornite", () => {
    expect(
      buildAdminStoreOptions({ stores: OPTIONS, currentStoreId: "ro" }).map(
        (store) => store.id,
      ),
    ).toEqual(["ro", "de"]);
  });

  it("pastreaza magazinul administrat chiar daca a fost oprit", () => {
    // Altfel comutatorul ar afisa alt magazin decat cel pe care lucrezi:
    // un `select` controlat fara `option` potrivita cade pe prima valoare.
    expect(
      buildAdminStoreOptions({ stores: OPTIONS, currentStoreId: "closed" }).map(
        (store) => store.id,
      ),
    ).toEqual(["ro", "de", "closed"]);
  });

  it("pastreaza ordinea primita", () => {
    const reversed = [...OPTIONS].reverse();
    expect(
      buildAdminStoreOptions({ stores: reversed, currentStoreId: "closed" }).map(
        (store) => store.id,
      ),
    ).toEqual(["closed", "de", "ro"]);
  });
});

describe("slug de magazin", () => {
  it("propune un slug din nume", () => {
    expect(slugifyStoreName("RuleShop Deutschland")).toBe("ruleshop-deutschland");
    expect(slugifyStoreName("Magazinul Ștefan & Fiii")).toBe("magazinul-stefan-fiii");
    expect(slugifyStoreName("  RuleShop  RO  ")).toBe("ruleshop-ro");
  });

  it("nu lasa cratime la capete, nici dupa tăierea la 40 de caractere", () => {
    const slug = slugifyStoreName("a".repeat(39) + " " + "b".repeat(10));
    expect(slug).toBe("a".repeat(39));
    expect(storeSlugSchema.safeParse(slug).success).toBe(true);
  });

  it("acceptă slug-uri valide și respinge restul", () => {
    for (const valid of ["ruleshop-ro", "ruleshop-de", "abc", "a1-b2-c3"]) {
      expect(storeSlugSchema.safeParse(valid).success).toBe(true);
    }
    for (const invalid of ["ab", "-ruleshop", "ruleshop-", "Rule Shop", "rule_shop", "a".repeat(41)]) {
      expect(storeSlugSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("normalizeaza intrarea inainte de validare", () => {
    expect(storeSlugSchema.parse("  RuleShop-DE  ")).toBe("ruleshop-de");
  });
});
