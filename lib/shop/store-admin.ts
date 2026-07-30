import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { Prisma, type Role, type Store } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { provisionStarterRulesets } from "@/lib/rules/provision";
import { DEFAULT_SHIPPING_METHODS } from "@/lib/shop/shipping-methods";
import { getActiveStore } from "@/lib/shop/store";
import {
  buildAdminStoreOptions,
  resolveAdminStoreId,
  type AdminStoreOption,
} from "@/lib/shop/store-selection";

/**
 * Magazinele din perspectiva control plane-ului: ce magazin administrezi acum,
 * cum se creeaza unul nou si care e magazinul activ (cel pe care il vad
 * clientii).
 */

/** Selectia de magazin a unui PLATFORM_ADMIN. Doar preferinta de panou. */
const ADMIN_STORE_COOKIE = "rs_admin_store";

export class StoreAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreAdminError";
  }
}

/** Starile magazinelor: o singura citire pe cerere, oricati apelanti ar fi. */
const listStoreStates = cache(async () =>
  prisma.store.findMany({ select: { id: true, active: true } }),
);

/**
 * Magazinul administrat de utilizatorul curent. Pentru personalul legat de un
 * magazin e chiar al lui; pentru platforma, cel comutat in panou (validat) sau,
 * in lipsa unei selectii valide, magazinul activ. Regula sta in
 * `resolveAdminStoreId`; aici se aduc doar cookie-ul si starile din baza.
 *
 * ATENTIE: functia nu se memoizeaza cu `cache()` si nici rezultatul ei nu are ce
 * cauta intr-un `cache()`. O server action care comuta magazinul ruleaza in
 * ACEEASI cerere cu re-randarea de dupa ea: daca rezultatul ar fi memoizat
 * inainte de `selectAdminStore`, randarea de dupa ar primi magazinul vechi si
 * panoul ar arata ca daca comutarea n-a avut loc. Cookie-ul se citeste din nou
 * la fiecare apel — e ieftin, iar interogarile din spate sunt memoizate.
 */
export async function getAdminStoreId({
  role,
  pinnedStoreId,
}: {
  role: Role;
  pinnedStoreId: string | null;
}): Promise<string> {
  // Acelasi lucru pe care il decide `resolveAdminStoreId` pentru rolurile de
  // magazin, scurtcircuitat ca sa nu citim cookie-ul si baza degeaba.
  if (role !== "PLATFORM_ADMIN") {
    return pinnedStoreId ?? (await getActiveStore()).id;
  }

  const jar = await cookies();
  const requestedStoreId = jar.get(ADMIN_STORE_COOKIE)?.value ?? null;

  // Fara selectie nu se citeste lista de magazine degeaba.
  if (!requestedStoreId) return (await getActiveStore()).id;

  const [stores, fallback] = await Promise.all([
    listStoreStates(),
    getActiveStore(),
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
 * Magazinele oferite comutatorului din panou. Citire directa, nememoizata: dupa
 * ce un magazin e pornit sau oprit, lista trebuie sa arate starea noua chiar si
 * in randarea din aceeasi cerere.
 */
export async function listAdminStoreOptions(
  currentStoreId: string,
): Promise<AdminStoreOption[]> {
  const stores = await prisma.store.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, slug: true, active: true },
  });
  return buildAdminStoreOptions({ currentStoreId, stores });
}

/**
 * Comuta magazinul administrat. De apelat DOAR din server actions (Next
 * interzice scrierea cookie-urilor in timpul randarii).
 */
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
  /** Devine magazinul activ, cel servit clientilor. */
  makeDefault: boolean;
}

/**
 * Magazin nou, functional din prima: metodele de livrare implicite si cele sase
 * rulesete publicate ca versiunea 1 (`provisionStarterRulesets`), aceleasi pe
 * care le primeste un magazin din seed. Fara produse — catalogul e treaba
 * administratorului.
 */
export async function createStore(input: CreateStoreInput): Promise<Store> {
  const existing = await prisma.store.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw new StoreAdminError(`Există deja un magazin cu slug-ul „${input.slug}”.`);
  }

  const store = await prisma.store.create({
    data: {
      slug: input.slug,
      name: input.name,
      currency: input.currency,
      locale: input.locale,
      settings: {
        shippingMethods: DEFAULT_SHIPPING_METHODS,
      } as Prisma.InputJsonValue,
    },
  });

  // Regulile de start folosesc metodele implicite, deci se pot referi la ele.
  await provisionStarterRulesets({
    db: prisma,
    storeId: store.id,
    options: {
      shipping: { express: "curier-express", locker: "easybox" },
      theme: { hex: "#2563eb", ink: "#1d4ed8", countryCode: "RO" },
    },
  });

  if (input.makeDefault) return setDefaultStore(store.id);
  return store;
}

/**
 * Muta magazinul activ — cel pe care il vad clientii. Exact unul are
 * `isDefault`: unicitatea se impune aici, nu prin index (un index unic pe
 * boolean ar interzice mai multe `false`).
 */
export async function setDefaultStore(storeId: string): Promise<Store> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new StoreAdminError("Magazinul nu există.");
  if (!store.active) {
    throw new StoreAdminError("Un magazin oprit nu poate fi magazinul activ.");
  }

  await prisma.store.updateMany({
    where: { isDefault: true, id: { not: storeId } },
    data: { isDefault: false },
  });
  return prisma.store.update({
    where: { id: storeId },
    data: { isDefault: true },
  });
}

/**
 * Porneste sau opreste un magazin. Magazinul activ nu se poate opri: clientii
 * ar rămâne fara magazin. Mai intai se mută magazinul activ, apoi se opreste.
 */
export async function setStoreActive(
  storeId: string,
  active: boolean,
): Promise<Store> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new StoreAdminError("Magazinul nu există.");

  if (!active && store.isDefault) {
    throw new StoreAdminError(
      "Magazinul activ nu poate fi oprit. Fă alt magazin activ mai întâi.",
    );
  }

  return prisma.store.update({ where: { id: storeId }, data: { active } });
}

/** Magazinele cu cate produse si comenzi au — pentru lista din panou. */
export async function listStoresWithCounts() {
  const stores = await prisma.store.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { products: true, orders: true, users: true } } },
  });
  return stores;
}
