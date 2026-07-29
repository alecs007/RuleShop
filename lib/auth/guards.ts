import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin, isStaff } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { getActiveStore } from "@/lib/shop/store";
import type { Role, User } from "@prisma/client";

export interface StaffContext {
  user: User;
  role: Role;
  /** Magazinul pe care staff-ul il administreaza. */
  storeId: string;
}

/**
 * Garda serverului pentru control plane. Verifica sesiunea + rolul PE SERVER
 * si incarca utilizatorul din DB (rolul din token e doar un hint de UI;
 * sursa de adevar ramane baza de date — un rol revocat isi pierde accesul
 * imediat, nu la expirarea JWT-ului).
 */
export const requireStaff = cache(async (): Promise<StaffContext> => {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/admin");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.active || !isStaff(user.role)) redirect("/auth/admin");

  // STORE_ADMIN/OPERATOR sunt legati de magazinul lor; PLATFORM_ADMIN
  // opereaza pe magazinul activ curent.
  const storeId = user.storeId ?? (await getActiveStore()).id;
  return { user, role: user.role, storeId };
});

/** Ca requireStaff, dar cere drepturi de scriere (STORE_ADMIN+). */
export const requireAdmin = cache(async (): Promise<StaffContext> => {
  const ctx = await requireStaff();
  if (!isAdmin(ctx.role)) redirect("/admin");
  return ctx;
});
