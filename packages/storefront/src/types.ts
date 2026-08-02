/**
 * Mirrors the `OrderStatus` enum in the Prisma schema, declared here so the
 * package does not depend on the generated client. If the enum changes,
 * `ORDER_STATUS_LABELS` stops compiling and the mismatch shows up at once.
 */

export const ORDER_STATUSES = [
  "PENDING",
  "AWAITING_REVIEW",
  "PAID",
  "FULFILLED",
  "CANCELLED",
  "REJECTED",
  "REFUNDED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Deliberately open-ended: rules may reference any path under `customer.*` or
 * `session.*`, including attributes added later.
 */
export interface ActorFacts {
  customer: Record<string, unknown>;
  session: Record<string, unknown>;
}
