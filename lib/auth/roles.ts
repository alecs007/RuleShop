import type { Role } from "@prisma/client";

/** Rolurile cu acces la control plane. */
export const STAFF_ROLES: Role[] = [
  "OPERATOR",
  "STORE_ADMIN",
  "PLATFORM_ADMIN",
];

/** Rolurile care pot modifica date (produse, reguli, publicari). */
export const ADMIN_ROLES: Role[] = ["STORE_ADMIN", "PLATFORM_ADMIN"];

export function isStaff(role: Role | undefined | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function isAdmin(role: Role | undefined | null): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}
