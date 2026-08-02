import type { Role } from "@prisma/client";

/**
 * Which store the current staff member administers — an authorization
 * decision, kept pure and away from cookies and the database so it can be
 * tested directly.
 *
 * `OPERATOR` and `STORE_ADMIN` are bound to `User.storeId` and cannot switch,
 * or a store admin could read another store's orders by setting a cookie. The
 * role decides, not `User.storeId`: an account promoted from `STORE_ADMIN` may
 * still carry one, and letting it win would make switching a no-op.
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
  /** The role from the database; only `PLATFORM_ADMIN` may switch. */
  role: Role;
  /** `User.storeId`, for staff bound to one store. */
  pinnedStoreId: string | null;
  /** The panel's selection; ignored for store-bound staff. */
  requestedStoreId: string | null;
  stores: SelectableStore[];
  fallbackStoreId: string;
}): string {
  if (role !== "PLATFORM_ADMIN") return pinnedStoreId ?? fallbackStoreId;

  // A stopped store is not administered: the stale selection falls back.
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
 * The running stores, plus the one being administered even if it was stopped
 * meanwhile: a controlled `<select>` with no matching `option` falls back to
 * its first value and would show a store you are not actually working in.
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
