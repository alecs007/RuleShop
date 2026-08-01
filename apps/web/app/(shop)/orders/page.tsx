import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import { getSessionUser } from "@/lib/auth/guards";
import { getActiveStore } from "@/lib/shop/store";
import { getSessionKey } from "@/lib/shop/session";
import { listOrdersForViewer } from "@/lib/shop/orders";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
} from "@/lib/shop/order-status";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { OrderTimeline } from "@/components/shop/order-timeline";

export const metadata: Metadata = { title: "Comenzile mele" };

/**
 * Comenzile vizitatorului curent — functioneaza si FARA cont: comenzile
 * plasate in regim guest se regasesc prin cookie-ul de sesiune. Un client care
 * isi face cont dupa cumparare le vede in continuare, in aceeasi lista.
 */
export default async function OrdersPage() {
  const store = await getActiveStore();
  const [viewer, sessionKey] = await Promise.all([
    getSessionUser(),
    getSessionKey(),
  ]);

  const orders = await listOrdersForViewer(store.id, {
    userId: viewer?.id ?? null,
    sessionKey,
  });

  return (
    <div className="appear-content mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Comenzile mele</h1>
      {!viewer && orders.length > 0 && (
        <p className="mt-1 text-sm text-ink-muted">
          Vezi comenzile plasate din acest browser.{" "}
          <Link
            href="/auth/signin?callbackUrl=/orders"
            className="text-accent hover:underline"
          >
            Autentifică-te
          </Link>{" "}
          ca să le păstrezi și pe alt dispozitiv.
        </p>
      )}

      {orders.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <Package className="size-10 text-ink-faint" strokeWidth={1.5} />
          <p className="mt-4 font-medium">Nicio comandă încă</p>
          <p className="mt-1 max-w-sm text-sm text-ink-muted">
            Comenzile plasate apar aici, cu statusul lor actualizat pe măsură ce
            sunt procesate.
          </p>
          <Link
            href="/products"
            className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Vezi produsele
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((order) => {
            const itemCount = order.items.reduce(
              (sum, item) => sum + item.quantity,
              0,
            );
            return (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.orderNumber}`}
                  className="group block rounded-xl border border-line bg-surface-raised p-5 transition-all hover:border-ink-faint hover:shadow-subtle"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">#{order.orderNumber}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {itemCount} {itemCount === 1 ? "produs" : "produse"} ·{" "}
                        {new Intl.DateTimeFormat("ro-RO", {
                          dateStyle: "medium",
                        }).format(order.placedAt ?? order.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">
                        {formatMoney(order.totalCents, order.currency)}
                      </p>
                      <Badge
                        tone={ORDER_STATUS_TONES[order.status]}
                        className="mt-1"
                      >
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-line pt-4">
                    <OrderTimeline status={order.status} />
                  </div>

                  <p className="mt-3 flex items-center gap-1 text-sm text-ink-muted transition-colors group-hover:text-ink">
                    Vezi detaliile
                    <ChevronRight className="size-3.5" strokeWidth={2} />
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
