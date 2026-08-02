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
  /** The store this staff member administers. */
  storeId: string;
}

/**
 * The current user, or null. Does not redirect — for UI decisions. The role
 * comes from the database, not the token, so revocations take effect at once.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  return user?.active ? user : null;
});

/** Session and role cannot change mid-request, so memoizing is safe here. */
const loadStaffUser = cache(async (): Promise<User> => {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/admin");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.active || !isStaff(user.role)) redirect("/auth/admin");
  return user;
});

/**
 * The control plane's server guard. Only the user is memoized, not the whole
 * context: the administered store does change mid-request when a server action
 * switches the panel, and a memoized one would leave the render after it
 * looking at the old store.
 */
export const requireStaff = async (): Promise<StaffContext> => {
  const user = await loadStaffUser();

  // The role decides, not `user.storeId` — see `resolveAdminStoreId`.
  const storeId = await getAdminStoreId({
    role: user.role,
    pinnedStoreId: user.storeId,
  });
  return { user, role: user.role, storeId };
};

/** Like requireStaff, but demands write access (STORE_ADMIN and up). */
export const requireAdmin = async (): Promise<StaffContext> => {
  const ctx = await requireStaff();
  if (!isAdmin(ctx.role)) redirect("/admin");
  return ctx;
};

/**
 * Guards platform-wide operations: creating stores, switching between them,
 * changing the active one. A STORE_ADMIN runs their store, not the platform.
 */
export const requirePlatformAdmin = async (): Promise<StaffContext> => {
  const ctx = await requireStaff();
  if (ctx.role !== "PLATFORM_ADMIN") redirect("/admin");
  return ctx;
};
