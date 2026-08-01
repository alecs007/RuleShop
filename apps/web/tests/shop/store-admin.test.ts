import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Comutarea de magazin din control plane, cu cookie-ul si baza de date
 * inlocuite de duble in memorie.
 *
 * `resolveAdminStoreId` acopera decizia pura; aici se verifica exact ce se
 * intampla in jurul ei: ce citeste din cookie, cand nu il citeste deloc, ce
 * ajunge in comutator si ce operatii sunt refuzate — pentru ca acolo stau
 * greselile care lasa panoul pe un magazin si utilizatorul cu impresia altuia.
 */

interface FakeStore {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  isDefault: boolean;
}

let stores: FakeStore[] = [];
let cookieJar: Map<string, string>;
const cookieSets: { name: string; value: string; options: unknown }[] = [];

const jar = {
  get: (name: string) => {
    const value = cookieJar.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set: (name: string, value: string, options: unknown) => {
    cookieJar.set(name, value);
    cookieSets.push({ name, value, options });
  },
};

vi.mock("next/headers", () => ({ cookies: async () => jar }));

/** Magazinul servit clientilor: primul pornit cu `isDefault`, altfel primul pornit. */
function activeStore(): FakeStore {
  const store =
    stores.find((s) => s.isDefault && s.active) ?? stores.find((s) => s.active);
  if (!store) throw new Error("niciun magazin pornit in fixture");
  return store;
}

vi.mock("@/lib/shop/store", () => ({ getActiveStore: async () => activeStore() }));

const findFirst = (where: Partial<FakeStore>) =>
  stores.find((store) =>
    Object.entries(where).every(([key, value]) => store[key as keyof FakeStore] === value),
  ) ?? null;

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    store: {
      findUnique: async ({ where }: { where: Partial<FakeStore> }) => findFirst(where),
      findFirst: async ({ where }: { where: Partial<FakeStore> }) => findFirst(where),
      findMany: async () => stores,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeStore>;
      }) => {
        const store = stores.find((s) => s.id === where.id);
        if (!store) throw new Error("magazin inexistent");
        Object.assign(store, data);
        return store;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { isDefault?: boolean; id?: { not: string } };
        data: Partial<FakeStore>;
      }) => {
        const hits = stores.filter(
          (store) =>
            (where.isDefault === undefined || store.isDefault === where.isDefault) &&
            (where.id === undefined || store.id !== where.id.not),
        );
        for (const store of hits) Object.assign(store, data);
        return { count: hits.length };
      },
    },
  },
}));

const {
  StoreAdminError,
  getAdminStoreId,
  listAdminStoreOptions,
  selectAdminStore,
  setDefaultStore,
  setStoreActive,
} = await import("@/lib/shop/store-admin");

const ADMIN_STORE_COOKIE = "rs_admin_store";

beforeEach(() => {
  stores = [
    { id: "ro", slug: "ruleshop-ro", name: "RuleShop RO", active: true, isDefault: true },
    { id: "de", slug: "ruleshop-de", name: "RuleShop DE", active: true, isDefault: false },
    { id: "off", slug: "magazin-oprit", name: "Magazin oprit", active: false, isDefault: false },
  ];
  cookieJar = new Map();
  cookieSets.length = 0;
});

describe("getAdminStoreId", () => {
  const platform = (pinnedStoreId: string | null = null) =>
    getAdminStoreId({ role: "PLATFORM_ADMIN", pinnedStoreId });

  it("cade pe magazinul activ cand nu exista selectie", async () => {
    await expect(platform()).resolves.toBe("ro");
  });

  it("respecta selectia din cookie", async () => {
    cookieJar.set(ADMIN_STORE_COOKIE, "de");
    await expect(platform()).resolves.toBe("de");
  });

  it("citeste cookie-ul la fiecare apel, nu o singura data", async () => {
    // Comutarea si re-randarea de dupa ea sunt in ACEEASI cerere: un rezultat
    // memoizat ar arata magazinul de dinainte de comutare.
    await expect(platform()).resolves.toBe("ro");
    cookieJar.set(ADMIN_STORE_COOKIE, "de");
    await expect(platform()).resolves.toBe("de");
  });

  it("lasa platforma sa comute si cand contul a rămas cu un storeId", async () => {
    // Contul promovat din STORE_ADMIN pastreaza `storeId`; rolul decide.
    cookieJar.set(ADMIN_STORE_COOKIE, "de");
    await expect(platform("ro")).resolves.toBe("de");
  });

  it("ignora un cookie catre un magazin oprit sau dispărut", async () => {
    for (const value of ["off", "sters"]) {
      cookieJar.set(ADMIN_STORE_COOKIE, value);
      await expect(platform()).resolves.toBe("ro");
    }
  });

  it("nu se uita la cookie pentru personalul legat de un magazin", async () => {
    // Izolarea multi-tenant: un STORE_ADMIN nu isi schimba magazinul cu un cookie.
    cookieJar.set(ADMIN_STORE_COOKIE, "de");
    await expect(
      getAdminStoreId({ role: "STORE_ADMIN", pinnedStoreId: "ro" }),
    ).resolves.toBe("ro");
    // Nici chiar cand magazinul lui a fost oprit — atunci nu are ce administra,
    // dar nu ajunge pe magazinul altcuiva.
    await expect(
      getAdminStoreId({ role: "OPERATOR", pinnedStoreId: "off" }),
    ).resolves.toBe("off");
    // Iar fara magazin in cont cade pe cel activ, tot fara sa asculte cookie-ul.
    await expect(
      getAdminStoreId({ role: "OPERATOR", pinnedStoreId: null }),
    ).resolves.toBe("ro");
  });
});

describe("listAdminStoreOptions", () => {
  it("ofera magazinele pornite, plus cel administrat daca a fost oprit", async () => {
    await expect(
      listAdminStoreOptions("ro").then((all) => all.map((s) => s.id)),
    ).resolves.toEqual(["ro", "de"]);
    await expect(
      listAdminStoreOptions("off").then((all) => all.map((s) => s.id)),
    ).resolves.toEqual(["ro", "de", "off"]);
  });
});

describe("selectAdminStore", () => {
  it("scrie cookie httpOnly, legat de tot panoul", async () => {
    await expect(selectAdminStore("de")).resolves.toMatchObject({ id: "de" });
    expect(cookieSets).toHaveLength(1);
    expect(cookieSets[0]).toMatchObject({
      name: ADMIN_STORE_COOKIE,
      value: "de",
      options: { httpOnly: true, sameSite: "lax", path: "/" },
    });
  });

  it("refuza un magazin oprit sau inexistent, fara sa atinga cookie-ul", async () => {
    await expect(selectAdminStore("off")).rejects.toBeInstanceOf(StoreAdminError);
    await expect(selectAdminStore("sters")).rejects.toBeInstanceOf(StoreAdminError);
    expect(cookieSets).toHaveLength(0);
  });
});

describe("magazinul activ", () => {
  it("mută `isDefault` pe un singur magazin", async () => {
    await setDefaultStore("de");
    expect(stores.filter((store) => store.isDefault).map((s) => s.id)).toEqual(["de"]);
  });

  it("nu face activ un magazin oprit", async () => {
    await expect(setDefaultStore("off")).rejects.toBeInstanceOf(StoreAdminError);
    expect(stores.find((store) => store.isDefault)?.id).toBe("ro");
  });

  it("nu opreste magazinul activ — clientii ar rămâne fara magazin", async () => {
    await expect(setStoreActive("ro", false)).rejects.toBeInstanceOf(StoreAdminError);
    expect(stores.find((store) => store.id === "ro")?.active).toBe(true);
  });

  it("opreste un magazin obisnuit si il porneste din nou", async () => {
    await expect(setStoreActive("de", false)).resolves.toMatchObject({ active: false });
    await expect(setStoreActive("de", true)).resolves.toMatchObject({ active: true });
  });

  it("lasa magazinul activ sa fie oprit dupa ce altul devine activ", async () => {
    await setDefaultStore("de");
    await expect(setStoreActive("ro", false)).resolves.toMatchObject({ active: false });
    // Iar panoul nu rămâne pe un magazin oprit: selectia veche cade pe cel activ.
    cookieJar.set(ADMIN_STORE_COOKIE, "ro");
    await expect(
      getAdminStoreId({ role: "PLATFORM_ADMIN", pinnedStoreId: null }),
    ).resolves.toBe("de");
  });
});
