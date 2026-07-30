"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FraudReviewStatus, type OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireStaff } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";

const reviewSchema = z.object({
  incidentId: z.string().min(1),
  status: z.enum(["CONFIRMED_FRAUD", "FALSE_POSITIVE", "DISMISSED"]),
  notes: z.string().trim().max(1000).optional(),
  /** Ce se intampla cu comanda atasata incidentului. */
  orderOutcome: z.enum(["none", "approve", "reject"]).default("none"),
});

export interface ReviewState {
  ok: boolean;
  message?: string;
}

/**
 * Verificarea umana a unui incident antifraudă: operatorul il clasifica si,
 * dacă incidentul are o comanda in aşteptare, decide daca aceasta se confirma
 * sau se respinge. Ambele operatii intra in jurnalul de audit.
 *
 * Clasificarea (fraudă confirmata / alarma falsa) este si eticheta pe care
 * modulul IA o va folosi pentru analiza tiparelor.
 */
export async function reviewIncidentAction(
  _prev: ReviewState | undefined,
  formData: FormData,
): Promise<ReviewState> {
  const { user, storeId } = await requireStaff();

  const parsed = reviewSchema.safeParse({
    incidentId: formData.get("incidentId"),
    status: formData.get("status"),
    notes: formData.get("notes") ?? undefined,
    orderOutcome: formData.get("orderOutcome") ?? "none",
  });
  if (!parsed.success) return { ok: false, message: "Cerere invalidă." };

  // Scoping pe storeId: un operator nu poate atinge incidentele altui magazin.
  const incident = await prisma.fraudIncident.findFirst({
    where: { id: parsed.data.incidentId, storeId },
    include: { order: { select: { id: true, status: true, orderNumber: true } } },
  });
  if (!incident) return { ok: false, message: "Incidentul nu există." };

  await prisma.fraudIncident.update({
    where: { id: incident.id },
    data: {
      reviewStatus: parsed.data.status as FraudReviewStatus,
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNotes: parsed.data.notes ?? null,
    },
  });
  await logAudit({
    storeId,
    action: "FRAUD_INCIDENT_REVIEWED",
    entityType: "FraudIncident",
    entityId: incident.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    before: { reviewStatus: incident.reviewStatus },
    after: { reviewStatus: parsed.data.status },
    metadata: { notes: parsed.data.notes ?? null },
    traceId: incident.traceId,
  });

  // Comanda atasata: doar cele care asteapta verificare pot fi decise aici.
  const order = incident.order;
  if (
    parsed.data.orderOutcome !== "none" &&
    order &&
    order.status === "AWAITING_REVIEW"
  ) {
    const nextStatus: OrderStatus =
      parsed.data.orderOutcome === "approve" ? "PAID" : "REJECTED";

    // La respingere stocul rezervat se intoarce in catalog.
    if (nextStatus === "REJECTED") {
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
      metadata: { incidentId: incident.id, orderNumber: order.orderNumber },
    });
  }

  revalidatePath("/admin/fraud");
  revalidatePath("/", "layout");
  return { ok: true, message: "Incident actualizat." };
}
