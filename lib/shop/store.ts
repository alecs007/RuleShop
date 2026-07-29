import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";

/**
 * Magazinul activ pentru cererea curenta.
 *
 * Deocamdata: magazinul implicit (DEFAULT_STORE_SLUG sau primul activ).
 * Cand platforma va servi mai multe magazine simultan, rezolvarea se va face
 * dupa domeniu/subdomeniu — doar aceasta functie se schimba, restul codului
 * primeste deja `store` de aici.
 */
export const getActiveStore = cache(async () => {
  const slug = process.env.DEFAULT_STORE_SLUG;
  const store = slug
    ? await prisma.store.findUnique({ where: { slug } })
    : await prisma.store.findFirst({
        where: { active: true },
        orderBy: { createdAt: "asc" },
      });

  if (!store) {
    throw new Error(
      "Niciun magazin configurat. Rulează `npm run db:seed` pentru datele demo.",
    );
  }
  return store;
});
