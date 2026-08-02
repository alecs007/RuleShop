"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireStaff } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { allowedTransitions } from "@ruleshop/storefront";
import { syncCustomerStats } from "@/lib/shop/customer-stats";

export async function updateOrderStatusAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireStaff();
  const orderId = formData.get("orderId");
  const nextStatus = formData.get("status") as OrderStatus | null;
  if (typeof orderId !== "string" || !nextStatus) return;

  // Scoped by storeId: another store's orders do not exist here.
  const order = await prisma.order.findFirst({ where: { id: orderId, storeId } });
  if (!order) return;
  if (!allowedTransitions(order.status).includes(nextStatus)) {
    throw new Error("Tranziție de status nepermisă.");
  }

  // Cancelling returns the stock the order took at placement.
  if (nextStatus === "CANCELLED") {
    const items = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: { productId: true, quantity: true },
    });
    for (const item of items) {
      if (!item.productId) continue;
      await prisma.product.updateMany({
        where: { id: item.productId, storeId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: nextStatus },
  });
  // The status crossed the "paid" line, so the customer facts the rules read
  // must be recomputed.
  await syncCustomerStats(storeId, order.userId);
  await logAudit({
    storeId,
    action: "ORDER_STATUS_CHANGED",
    entityType: "Order",
    entityId: order.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    before: { status: order.status },
    after: { status: nextStatus },
    metadata: { orderNumber: order.orderNumber },
  });

  // `layout` covers the customer's pages too, so their order shows the new
  // status on their next navigation.
  revalidatePath("/admin/orders");
  revalidatePath("/", "layout");
}
