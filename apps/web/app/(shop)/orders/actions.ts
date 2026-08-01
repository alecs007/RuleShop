"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth/guards";
import { getActiveStore } from "@/lib/shop/store";
import { getSessionKey } from "@/lib/shop/session";
import { findOrderForViewer } from "@/lib/shop/orders";
import { syncCustomerStats } from "@/lib/shop/customer-stats";

export interface CancelOrderState {
  ok: boolean;
  message?: string;
}

/**
 * Anularea comenzii de catre client. Permisa DOAR cat timp comanda nu a fost
 * incasata sau expediata (status PENDING): dupa plata, anularea inseamna
 * rambursare, care rămâne o decizie a operatorului.
 *
 * Dreptul de acces se verifica pe server prin `findOrderForViewer` (cont sau
 * cookie de sesiune) — numarul comenzii singur nu da acces.
 */
export async function cancelOrderAction(
  _prev: CancelOrderState | undefined,
  formData: FormData,
): Promise<CancelOrderState> {
  const orderNumber = String(formData.get("orderNumber") ?? "");
  if (!orderNumber) return { ok: false, message: "Cerere invalidă." };

  const store = await getActiveStore();
  const [viewer, sessionKey] = await Promise.all([
    getSessionUser(),
    getSessionKey(),
  ]);

  const order = await findOrderForViewer(store.id, orderNumber, {
    userId: viewer?.id ?? null,
    sessionKey,
  });
  if (!order) return { ok: false, message: "Comanda nu a fost găsită." };
  if (order.status !== "PENDING") {
    return {
      ok: false,
      message:
        "Comanda nu mai poate fi anulată din cont. Contactează-ne pentru ajutor.",
    };
  }

  // Stocul rezervat la plasare se intoarce in catalog.
  for (const item of order.items) {
    if (!item.productId) continue;
    await prisma.product.updateMany({
      where: { id: item.productId, storeId: store.id },
      data: { stock: { increment: item.quantity } },
    });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
  });
  await syncCustomerStats(store.id, order.userId);
  await logAudit({
    storeId: store.id,
    action: "ORDER_STATUS_CHANGED",
    entityType: "Order",
    entityId: order.id,
    actorId: viewer?.id ?? null,
    actorEmail: viewer?.email ?? order.guestEmail,
    before: { status: order.status },
    after: { status: "CANCELLED" },
    metadata: { orderNumber: order.orderNumber, cancelledBy: "customer" },
  });

  // `layout`: si lista clientului si paginile de admin arata noul status.
  revalidatePath("/", "layout");
  return { ok: true, message: "Comanda a fost anulată." };
}
