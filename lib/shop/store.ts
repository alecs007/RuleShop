import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import type { Store } from "@prisma/client";

/**
 * Magazinul servit cererii curente — cel pe care il vad clientii.
 *
 * Ordinea de rezolvare:
 *  1. `DEFAULT_STORE_SLUG` — override de mediu, pentru dev si teste;
 *  2. magazinul marcat activ in baza de date (`Store.isDefault`), pe care
 *     administratorul il schimba din control plane, fara deploy;
 *  3. primul magazin pornit, ca plasa de siguranta pe o instalare proaspata.
 *
 * Toate cele trei cer `active: true`: un magazin oprit nu se serveste, nici
 * cand e cerut explicit prin variabila de mediu — altfel oprirea unui magazin
 * ar lasa clientii pe un magazin despre care panoul spune ca e inchis.
 *
 * Cand platforma va servi mai multe magazine simultan, aici se adauga
 * rezolvarea dupa domeniu (`Store.domain`) — restul codului primeste deja
 * `store` de aici si nu se schimba.
 */
export const getActiveStore = cache(async (): Promise<Store> => {
  const slug = process.env.DEFAULT_STORE_SLUG;

  const store =
    (slug ? await prisma.store.findFirst({ where: { slug, active: true } }) : null) ??
    (await prisma.store.findFirst({ where: { isDefault: true, active: true } })) ??
    (await prisma.store.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!store) {
    throw new Error(
      "Niciun magazin configurat. Rulează `npm run db:seed` pentru datele demo.",
    );
  }
  return store;
});
