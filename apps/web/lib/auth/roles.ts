import type { Role } from "@prisma/client";

/** Roles with control plane access. */
export const STAFF_ROLES: Role[] = [
  "OPERATOR",
  "STORE_ADMIN",
  "PLATFORM_ADMIN",
];

/** Roles that may change data: products, rules, publishes. */
export const ADMIN_ROLES: Role[] = ["STORE_ADMIN", "PLATFORM_ADMIN"];

export function isStaff(role: Role | undefined | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function isAdmin(role: Role | undefined | null): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}
