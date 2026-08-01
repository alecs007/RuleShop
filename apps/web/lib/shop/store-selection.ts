import type { Role } from "@prisma/client";

/**
 * Ce magazin administreaza staff-ul curent.
 *
 * Regula de baza: `OPERATOR` si `STORE_ADMIN` sunt legati de magazinul din cont
 * (`User.storeId`) si NU pot comuta — altfel un admin de magazin ar putea citi
 * comenzile altui magazin doar setandu-si un cookie. Comutarea conteaza doar
 * pentru `PLATFORM_ADMIN`.
 *
 * Decizia porneste de la ROL, nu de la `User.storeId`: un cont de platforma
 * promovat din `STORE_ADMIN` poate rămâne cu un `storeId` in rand, si daca acela
 * ar avea prioritate, comutarea n-ar avea niciun efect — panoul ar arata mereu
 * acelasi magazin. Invers, personalul unui magazin fara `storeId` nu capata
 * dreptul de a alege: cade pe magazinul activ, iar cookie-ul e ignorat.
 *
 * Functie pura, separata de accesul la cookie-uri si baza de date, ca sa poata
 * fi verificata direct in teste — e o decizie de autorizare.
 */

export interface SelectableStore {
  id: string;
  active: boolean;
}

export function resolveAdminStoreId({
  role,
  pinnedStoreId,
  requestedStoreId,
  stores,
  fallbackStoreId,
}: {
  /** Rolul din baza de date; doar `PLATFORM_ADMIN` poate comuta. */
  role: Role;
  /** `User.storeId` — magazinul din contul personalului de magazin. */
  pinnedStoreId: string | null;
  /** Selectia din panou (cookie); nu are efect pentru personal legat de magazin. */
  requestedStoreId: string | null;
  /** Magazinele existente, cu starea lor. */
  stores: SelectableStore[];
  /** Magazinul activ, cel servit clientilor. */
  fallbackStoreId: string;
}): string {
  if (role !== "PLATFORM_ADMIN") return pinnedStoreId ?? fallbackStoreId;

  // Un magazin oprit nu se administreaza: selectia veche cade pe implicit.
  const requested = requestedStoreId
    ? stores.find((store) => store.id === requestedStoreId && store.active)
    : undefined;

  return requested?.id ?? fallbackStoreId;
}

export interface AdminStoreOption {
  id: string;
  name: string;
  slug: string;
  active: boolean;
}

/**
 * Ce magazine apar in comutatorul din panou: cele pornite, plus magazinul
 * administrat acum chiar daca a fost oprit intre timp.
 *
 * Magazinul curent trebuie sa fie mereu in lista, altfel `<select>`-ul ar afisa
 * alt magazin decat cel pe care lucrezi de fapt (un `select` controlat fara
 * `option` potrivita cade pe prima valoare). Cazul apare cand un magazin e oprit
 * dintr-o alta sesiune, sau cand `DEFAULT_STORE_SLUG` indica un magazin oprit.
 */
export function buildAdminStoreOptions<T extends AdminStoreOption>({
  stores,
  currentStoreId,
}: {
  stores: T[];
  currentStoreId: string;
}): T[] {
  return stores.filter((store) => store.active || store.id === currentStoreId);
}
