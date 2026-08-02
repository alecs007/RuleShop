import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { Prisma, type Role, type Store } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { provisionStarterRulesets } from "@/lib/rules/provision";
import { DEFAULT_SHIPPING_METHODS } from "@ruleshop/storefront";
import { getFallbackAdminStore } from "@/lib/shop/store";
import {
  buildAdminStoreOptions,
  resolveAdminStoreId,
  type AdminStoreOption,
} from "@/lib/shop/store-selection";
import { isValidPathPrefix, RESERVED_SEGMENTS } from "@/lib/shop/routing";

/** A PLATFORM_ADMIN's store selection. A panel preference, nothing more. */
const ADMIN_STORE_COOKIE = "rs_admin_store";

export class StoreAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreAdminError";
  }
}

const listStoreStates = cache(async () =>
  prisma.store.findMany({ select: { id: true, active: true } }),
);

/**
 * The store the current user administers. The rule itself lives in
 * `resolveAdminStoreId`; this only fetches the cookie and the store states.
 *
 * Deliberately NOT memoized with `cache()`: a server action that switches the
 * store runs in the same request as the re-render after it, so a memoized
 * result would hand that render the old store and the switch would look like
 * it never happened.
 */
export async function getAdminStoreId({
  role,
  pinnedStoreId,
}: {
  role: Role;
  pinnedStoreId: string | null;
}): Promise<string> {
  // What `resolveAdminStoreId` would decide for store roles anyway, short
  // circuited so we do not read the cookie and the database for nothing.
  if (role !== "PLATFORM_ADMIN") {
    return pinnedStoreId ?? (await getFallbackAdminStore()).id;
  }

  const jar = await cookies();
  const requestedStoreId = jar.get(ADMIN_STORE_COOKIE)?.value ?? null;

  if (!requestedStoreId) return (await getFallbackAdminStore()).id;

  const [stores, fallback] = await Promise.all([
    listStoreStates(),
    getFallbackAdminStore(),
  ]);

  return resolveAdminStoreId({
    role,
    pinnedStoreId,
    requestedStoreId,
    stores,
    fallbackStoreId: fallback.id,
  });
}

/**
 * Unmemoized on purpose: after a store is turned on or off the list must show
 * the new state, even in a render from the same request.
 */
export async function listAdminStoreOptions(
  currentStoreId: string,
): Promise<AdminStoreOption[]> {
  const stores = await prisma.store.findMany({
    orderBy: [{ pathPrefix: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, slug: true, active: true },
  });
  return buildAdminStoreOptions({ currentStoreId, stores });
}

/** Server actions only: Next forbids writing cookies during a render. */
export async function selectAdminStore(storeId: string): Promise<Store> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new StoreAdminError("Magazinul nu există.");
  if (!store.active) {
    throw new StoreAdminError(
      "Magazinul este oprit. Pornește-l înainte să îl administrezi.",
    );
  }

  const jar = await cookies();
  jar.set(ADMIN_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return store;
}

export interface CreateStoreInput {
  name: string;
  slug: string;
  currency: string;
  locale: string;
  /** `de` -> /de. null is the main store, served at the root; only one may be. */
  pathPrefix: string | null;
}

/**
 * A new store, usable straight away: the default shipping methods and the six
 * rulesets published as version 1. No products — the catalog is the admin's.
 */
export async function createStore(input: CreateStoreInput): Promise<Store> {
  const existing = await prisma.store.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw new StoreAdminError(`Există deja un magazin cu slug-ul „${input.slug}”.`);
  }
  await assertPathPrefixFree(input.pathPrefix, null);

  const store = await prisma.store.create({
    data: {
      slug: input.slug,
      name: input.name,
      currency: input.currency,
      locale: input.locale,
      pathPrefix: input.pathPrefix,
      settings: {
        shippingMethods: DEFAULT_SHIPPING_METHODS,
      } as Prisma.InputJsonValue,
    },
  });

  // The starter rules reference the default shipping methods by id.
  await provisionStarterRulesets({
    db: prisma,
    storeId: store.id,
    options: {
      shipping: { express: "curier-express", locker: "easybox" },
      theme: { hex: "#2563eb", ink: "#1d4ed8", countryCode: "RO" },
    },
  });

  return store;
}

/** `null` means the main store, and there can only be one of those. */
async function assertPathPrefixFree(
  prefix: string | null,
  currentStoreId: string | null,
): Promise<void> {
  if (prefix !== null && !isValidPathPrefix(prefix)) {
    throw new StoreAdminError(
      `Prefixul „${prefix}” nu este valid. Folosește litere mici și cratime, ` +
        `și evită numele rutelor aplicației (${[...RESERVED_SEGMENTS].slice(0, 5).join(", ")}…).`,
    );
  }

  const taken = await prisma.store.findFirst({
    where: {
      pathPrefix: prefix,
      ...(currentStoreId ? { id: { not: currentStoreId } } : {}),
    },
    select: { name: true },
  });
  if (!taken) return;

  throw new StoreAdminError(
    prefix === null
      ? `„${taken.name}” este deja magazinul principal. Dă-i un prefix înainte.`
      : `Prefixul „${prefix}” este folosit de „${taken.name}”.`,
  );
}

/**
 * Moves the main store. The previous one takes over the prefix the new one
 * frees, so no store ends up unreachable and none share the root.
 */
export async function setMainStore(storeId: string): Promise<Store> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new StoreAdminError("Magazinul nu există.");
  if (store.pathPrefix === null) return store;

  const previous = await prisma.store.findFirst({ where: { pathPrefix: null } });
  const freed = store.pathPrefix;

  return prisma.$transaction(async (tx) => {
    if (previous) {
      await tx.store.update({
        where: { id: previous.id },
        data: { pathPrefix: freed },
      });
    }
    return tx.store.update({
      where: { id: storeId },
      data: { pathPrefix: null },
    });
  });
}

export async function setStorePathPrefix(
  storeId: string,
  prefix: string,
): Promise<Store> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new StoreAdminError("Magazinul nu există.");
  if (store.pathPrefix === null) {
    throw new StoreAdminError(
      "Magazinul principal se servește la rădăcină. Fă alt magazin principal întâi.",
    );
  }
  await assertPathPrefixFree(prefix, storeId);
  return prisma.store.update({ where: { id: storeId }, data: { pathPrefix: prefix } });
}

/**
 * Any store may be turned off, the main one included, and all of them at once:
 * a closed store answers with a closed-store page rather than nothing.
 */
export async function setStoreActive(
  storeId: string,
  active: boolean,
): Promise<Store> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new StoreAdminError("Magazinul nu există.");

  return prisma.store.update({ where: { id: storeId }, data: { active } });
}

export async function listStoresWithCounts() {
  const stores = await prisma.store.findMany({
    // The main store first, then the rest by prefix.
    orderBy: [{ pathPrefix: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { products: true, orders: true, users: true } } },
  });
  return stores;
}
