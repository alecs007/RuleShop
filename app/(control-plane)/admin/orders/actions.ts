"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireStaff } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { allowedTransitions } from "@/lib/shop/order-status";
import { syncCustomerStats } from "@/lib/shop/customer-stats";

export async function updateOrderStatusAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireStaff();
  const orderId = formData.get("orderId");
  const nextStatus = formData.get("status") as OrderStatus | null;
  if (typeof orderId !== "string" || !nextStatus) return;

  // Scoping pe storeId: comenzile altui magazin nu exista pentru acest staff.
  const order = await prisma.order.findFirst({ where: { id: orderId, storeId } });
  if (!order) return;
  if (!allowedTransitions(order.status).includes(nextStatus)) {
    throw new Error("Tranziție de status nepermisă.");
  }

  // Anularea intoarce stocul in catalog (comanda l-a scazut la plasare).
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
  // Statusul a intrat sau a ieșit din categoria „incasat" ⇒ faptele de client
  // folosite de reguli trebuie recalculate.
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

  // `layout` acopera si paginile clientului: comanda lui isi arata noul status
  // la prima navigare, fara sa fie nevoie de vreo acțiune din partea lui.
  revalidatePath("/admin/orders");
  revalidatePath("/", "layout");
}
