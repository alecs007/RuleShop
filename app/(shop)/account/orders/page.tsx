import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getActiveStore } from "@/lib/shop/store";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Comenzile mele" };

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin?callbackUrl=/account/orders");

  const store = await getActiveStore();
  const orders = await prisma.order.findMany({
    where: { storeId: store.id, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Comenzile mele</h1>

      {orders.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <Package className="size-10 text-ink-faint" strokeWidth={1.5} />
          <p className="mt-4 font-medium">Nicio comanda inca</p>
          <p className="mt-1 text-sm text-ink-muted">
            Comenzile plasate vor aparea aici, cu statusul si istoricul lor.
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
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-raised p-5"
            >
              <div>
                <p className="font-medium">#{order.orderNumber}</p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {order.items.length} produse ·{" "}
                  {new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(order.createdAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">
                  {formatMoney(order.totalCents, order.currency)}
                </p>
                <Badge className="mt-1">{order.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
