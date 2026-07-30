import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Statisticile de client folosite ca FAPTE de motorul de reguli
 * (`customer.completedOrders`, `customer.lifetimeSpend`).
 *
 * Recalculul este IDEMPOTENT: se numara din nou comenzile incasate ale
 * utilizatorului, nu se incrementeaza un contor. Asta e important pentru ca
 * statusul unei comenzi se poate schimba in ambele sensuri (confirmare,
 * anulare, respingere la review-ul antifraudă, rambursare) — un contor
 * incremental s-ar desincroniza la prima anulare, iar regulile ar decide pe
 * date false.
 *
 * Comenzile in regim guest nu au `userId`, deci nu contribuie: nu exista un
 * profil de client de actualizat. Ele devin relevante daca acelasi email se
 * autentifica ulterior — atunci comenzile se pot atribui contului.
 */

/** Statusurile care inseamna „client a cumparat efectiv". */
const COMPLETED_STATUSES = ["PAID", "FULFILLED"] as const;

export interface CustomerStats {
  completedOrders: number;
  lifetimeSpend: number;
}

/**
 * Recalculeaza si salveaza statisticile unui client dintr-un magazin.
 * Nu arunca niciodata: o eroare aici nu trebuie sa rupa plasarea comenzii sau
 * acțiunea adminului — dar o logam, ca desincronizarea sa fie vizibila.
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
      _sum: { totalCents: true },
    });

    const stats: CustomerStats = {
      completedOrders: result._count,
      lifetimeSpend: result._sum.totalCents ?? 0,
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

/**
 * Ca mai sus, plecand de la o comanda: gaseste proprietarul si resincronizeaza.
 * Folosita de acțiunile care schimba statusul unei comenzi.
 */
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
