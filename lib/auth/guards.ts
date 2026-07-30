import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin, isStaff } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { getAdminStoreId } from "@/lib/shop/store-admin";
import type { Role, User } from "@prisma/client";

export interface StaffContext {
  user: User;
  role: Role;
  /** Magazinul pe care staff-ul il administreaza. */
  storeId: string;
}

/**
 * Utilizatorul curent din DB, sau null daca nu e autentificat. NU
 * redirecteaza — pentru decizii de interfata (ex: ce afiseaza meniul de cont).
 * Rolul vine din baza de date, nu din token, ca sa reflecte imediat
 * promovarile si revocarile.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  return user?.active ? user : null;
});

/**
 * Utilizatorul din spatele cererii, o singura data pe cerere. Sesiunea si rolul
 * nu se schimba in timpul unei cereri, deci memoizarea e sigura aici.
 */
const loadStaffUser = cache(async (): Promise<User> => {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/admin");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.active || !isStaff(user.role)) redirect("/auth/admin");
  return user;
});

/**
 * Garda serverului pentru control plane. Verifica sesiunea + rolul PE SERVER
 * si incarca utilizatorul din DB (rolul din token e doar un hint de UI;
 * sursa de adevar ramane baza de date — un rol revocat isi pierde accesul
 * imediat, nu la expirarea JWT-ului).
 *
 * Contextul nu se memoizeaza intreg, doar utilizatorul: magazinul administrat SE
 * schimba in timpul unei cereri, cand o server action comuta panoul pe alt
 * magazin. Memoizat, randarea de dupa comutare ar primi magazinul de dinainte —
 * exact bug-ul „comut si nu se schimba nimic".
 */
export const requireStaff = async (): Promise<StaffContext> => {
  const user = await loadStaffUser();

  // STORE_ADMIN/OPERATOR sunt legati de magazinul lor si nu pot comuta;
  // PLATFORM_ADMIN administreaza magazinul selectat in panou (sau cel activ).
  // Decide rolul, nu `user.storeId` — vezi `resolveAdminStoreId`.
  const storeId = await getAdminStoreId({
    role: user.role,
    pinnedStoreId: user.storeId,
  });
  return { user, role: user.role, storeId };
};

/**
 * Ca requireStaff, dar cere drepturi de scriere (STORE_ADMIN+). Nememoizata din
 * acelasi motiv: contextul include magazinul administrat, care se poate schimba
 * in timpul cererii.
 */
export const requireAdmin = async (): Promise<StaffContext> => {
  const ctx = await requireStaff();
  if (!isAdmin(ctx.role)) redirect("/admin");
  return ctx;
};

/**
 * Garda operatiilor de platforma: creare de magazine, comutare intre ele,
 * schimbarea magazinului activ. Un STORE_ADMIN administreaza magazinul lui,
 * nu platforma.
 */
export const requirePlatformAdmin = async (): Promise<StaffContext> => {
  const ctx = await requireStaff();
  if (ctx.role !== "PLATFORM_ADMIN") redirect("/admin");
  return ctx;
};
