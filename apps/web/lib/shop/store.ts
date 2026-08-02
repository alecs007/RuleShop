import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import type { Store } from "@prisma/client";
import { MAIN_STORE_SEGMENT } from "./routing";

/**
 * The store is resolved from the route's `[store]` segment and passed on
 * explicitly, never held as an ambient value, so two requests for different
 * stores can be served in parallel by the same process. Memoized per request
 * and per segment.
 */
export const getStoreBySegment = cache(
  async (segment: string): Promise<Store | null> => {
    const override = process.env.DEFAULT_STORE_SLUG;

    if (segment === MAIN_STORE_SEGMENT) {
      // Development override: serve a given store at the root without
      // making it the main one in the database.
      if (override) {
        return prisma.store.findFirst({ where: { slug: override } });
      }
      return prisma.store.findFirst({ where: { pathPrefix: null } });
    }

    return prisma.store.findFirst({ where: { pathPrefix: segment } });
  },
);

/**
 * The layout has already checked the store, but pages cannot assume that in
 * the type system, so each asks again and `cache()` keeps it free. A missing
 * or stopped store 404s here; the closed-store page is the layout's job.
 */
export async function requireStore(segment: string): Promise<Store> {
  const store = await getStoreBySegment(segment);
  if (!store?.active) notFound();
  return store;
}

/**
 * Server actions get no route params, so storefront forms send the prefix in a
 * hidden field. It comes from the client and is treated as such: it must
 * resolve to a real, running store or the action refuses. Not a security
 * boundary — it keeps actions in step with the store in the address bar.
 */
export async function storeFromForm(formData: FormData): Promise<Store | null> {
  const raw = formData.get("storePrefix");
  const segment = typeof raw === "string" && raw !== "" ? raw : MAIN_STORE_SEGMENT;
  const store = await getStoreBySegment(segment);
  return store?.active ? store : null;
}

/**
 * The main store, served at the root. May be missing or stopped; the storefront
 * routes handle both by showing a closed-store page instead of throwing.
 */
export const getMainStore = cache(
  async (): Promise<Store | null> => getStoreBySegment(MAIN_STORE_SEGMENT),
);

/** Running stores, for the storefront switcher and the sitemap. */
export const listPublicStores = cache(async () =>
  prisma.store.findMany({
    where: { active: true },
    select: { id: true, name: true, pathPrefix: true, locale: true },
    orderBy: [{ pathPrefix: "asc" }],
  }),
);

/**
 * The store admin operations fall back to when none is explicit (uploads, AI
 * calls by a PLATFORM_ADMIN with no pinned store). Prefers the main one, but
 * takes any, so the panel works before one has been designated.
 */
export const getFallbackAdminStore = cache(async (): Promise<Store> => {
  const store =
    (await prisma.store.findFirst({ where: { pathPrefix: null } })) ??
    (await prisma.store.findFirst({ orderBy: { createdAt: "asc" } }));

  if (!store) {
    throw new Error(
      "Niciun magazin configurat. Rulează `pnpm db:seed` pentru datele demo.",
    );
  }
  return store;
});
