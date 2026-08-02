import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Store switching in the control plane, with the cookie and the database
 * replaced by in-memory doubles.
 *
 * `resolveAdminStoreId` covers the pure decision; this covers what happens
 * around it — what is read from the cookie, when it is not read at all, what
 * reaches the switcher and what is refused. That is where the mistakes live
 * that leave the panel on one store and the user believing another.
 */

interface FakeStore {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  pathPrefix: string | null;
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

/** The panel's fallback store: the main one, or the first created. */
function fallbackStore(): FakeStore {
  const store = stores.find((s) => s.pathPrefix === null) ?? stores[0];
  if (!store) throw new Error("niciun magazin in fixture");
  return store;
}

vi.mock("@/lib/shop/store", () => ({
  getFallbackAdminStore: async () => fallbackStore(),
}));

const findFirst = (where: Partial<FakeStore>) =>
  stores.find((store) =>
    Object.entries(where).every(([key, value]) => store[key as keyof FakeStore] === value),
  ) ?? null;

vi.mock("@/lib/db/prisma", () => {
  const store = {
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
        where: { pathPrefix?: string | null; id?: { not: string } };
        data: Partial<FakeStore>;
      }) => {
        const hits = stores.filter(
          (store) =>
            (where.pathPrefix === undefined || store.pathPrefix === where.pathPrefix) &&
            (where.id === undefined || store.id !== where.id.not),
        );
        for (const store of hits) Object.assign(store, data);
        return { count: hits.length };
      },
  };

  return {
    prisma: {
      store,
      // `setMainStore` changes two stores at once; here it runs directly.
      $transaction: async (fn: (tx: { store: typeof store }) => Promise<unknown>) =>
        fn({ store }),
    },
  };
});

const {
  StoreAdminError,
  getAdminStoreId,
  listAdminStoreOptions,
  selectAdminStore,
  setMainStore,
  setStoreActive,
} = await import("@/lib/shop/store-admin");

const ADMIN_STORE_COOKIE = "rs_admin_store";

beforeEach(() => {
  stores = [
    { id: "ro", slug: "ruleshop-ro", name: "RuleShop RO", active: true, pathPrefix: null },
    { id: "de", slug: "ruleshop-de", name: "RuleShop DE", active: true, pathPrefix: "de" },
    { id: "off", slug: "magazin-oprit", name: "Magazin oprit", active: false, pathPrefix: "hu" },
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
    // The switch and the render after it share a request: a memoized result
    // would show the store from before the switch.
    await expect(platform()).resolves.toBe("ro");
    cookieJar.set(ADMIN_STORE_COOKIE, "de");
    await expect(platform()).resolves.toBe("de");
  });

  it("lasa platforma sa comute si cand contul a rămas cu un storeId", async () => {
    // An account promoted from STORE_ADMIN keeps `storeId`; the role decides.
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
    // A STORE_ADMIN cannot change store with a cookie.
    cookieJar.set(ADMIN_STORE_COOKIE, "de");
    await expect(
      getAdminStoreId({ role: "STORE_ADMIN", pinnedStoreId: "ro" }),
    ).resolves.toBe("ro");
    // Not even when their store is stopped: then there is nothing to
    // administer, but they still do not land on someone else's.
    await expect(
      getAdminStoreId({ role: "OPERATOR", pinnedStoreId: "off" }),
    ).resolves.toBe("off");
    // With no store on the account it falls back to the active one, still
    // ignoring the cookie.
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

describe("magazinul principal si oprirea magazinelor", () => {
  it("muta magazinul principal si da vechiului principal prefixul eliberat", async () => {
    await setMainStore("de");

    // Exactly one is left without a prefix: the one served at the root.
    expect(stores.filter((s) => s.pathPrefix === null).map((s) => s.id)).toEqual(["de"]);
    // The previous one takes the freed prefix, so it stays reachable.
    expect(stores.find((s) => s.id === "ro")?.pathPrefix).toBe("de");
  });

  it("nu face nimic daca magazinul este deja principal", async () => {
    await expect(setMainStore("ro")).resolves.toMatchObject({ id: "ro" });
    expect(stores.filter((s) => s.pathPrefix === null).map((s) => s.id)).toEqual(["ro"]);
  });

  it("un magazin oprit poate deveni principal — raspunde cu pagina de magazin inchis", async () => {
    await expect(setMainStore("off")).resolves.toMatchObject({ id: "off" });
    expect(stores.find((s) => s.id === "off")?.pathPrefix).toBeNull();
  });

  it("opreste si porneste orice magazin, inclusiv pe cel principal", async () => {
    await expect(setStoreActive("ro", false)).resolves.toMatchObject({ active: false });
    await expect(setStoreActive("ro", true)).resolves.toMatchObject({ active: true });
    await expect(setStoreActive("de", false)).resolves.toMatchObject({ active: false });
  });

  it("lasa toate magazinele oprite simultan", async () => {
    for (const store of stores) await setStoreActive(store.id, false);
    expect(stores.every((s) => !s.active)).toBe(true);
  });
});
