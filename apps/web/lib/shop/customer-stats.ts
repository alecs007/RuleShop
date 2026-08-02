import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Customer statistics the rule engine reads as facts
 * (`customer.completedOrders`, `lifetimeSpend`, `loyaltyPoints`).
 *
 * Recomputation is idempotent — the paid orders are counted again rather than
 * a counter incremented — because an order's status moves in both directions.
 * The same holds for the points balance: each order keeps the points the
 * LOYALTY ruleset decided, and the balance is their sum minus what was spent,
 * so a cancelled order withdraws its points without any compensating write.
 */

/** The statuses that mean the customer actually bought something. */
const COMPLETED_STATUSES = ["PAID", "FULFILLED"] as const;

export interface CustomerStats {
  completedOrders: number;
  lifetimeSpend: number;
  loyaltyPoints: number;
}

/**
 * Never throws: a failure here must not break placing an order, but it is
 * logged so the drift stays visible.
 */
export async function syncCustomerStats(
  storeId: string,
  userId: string | null,
): Promise<CustomerStats | null> {
  if (!userId) return null;

  try {
    const result = await prisma.order.aggregate({
      where: { storeId, userId, status: { in: [...COMPLETED_STATUSES] } },
      _count: true,
      _sum: {
        totalCents: true,
        loyaltyPointsEarned: true,
        loyaltyPointsSpent: true,
      },
    });

    const stats: CustomerStats = {
      completedOrders: result._count,
      lifetimeSpend: result._sum.totalCents ?? 0,
      // The balance stays non-negative even on inconsistent data.
      loyaltyPoints: Math.max(
        0,
        (result._sum.loyaltyPointsEarned ?? 0) - (result._sum.loyaltyPointsSpent ?? 0),
      ),
    };

    await prisma.user.update({
      where: { id: userId },
      data: stats,
    });
    return stats;
  } catch (error) {
    console.error("[customer-stats] recalculul a eșuat:", error);
    return null;
  }
}

/** The same, starting from an order: finds the owner and resyncs. */
export async function syncCustomerStatsForOrder(
  storeId: string,
  orderId: string,
): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    select: { userId: true },
  });
  await syncCustomerStats(storeId, order?.userId ?? null);
}
