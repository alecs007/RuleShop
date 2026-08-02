import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Clienți" };

/** How many recent orders the aggregation covers. */
const ORDER_SAMPLE = 2000;

interface CustomerRow {
  key: string;
  email: string;
  name: string | null;
  registered: boolean;
  loyaltyTier: string | null;
  orders: number;
  totalCents: number;
  currency: string;
  lastOrderAt: Date;
  lastOrderNumber: string;
}

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { storeId } = await requireStaff();
  const { q } = await searchParams;
  const query = q?.trim().toLowerCase() || "";

  // A store's customers are whoever ordered here, account or guest.
  // Aggregated in JS over a capped set of recent orders, rather than with
  // `groupBy`, which has its quirks on MongoDB.
  const orders = await prisma.order.findMany({
    where: { storeId, status: { notIn: ["REJECTED"] } },
    orderBy: { createdAt: "desc" },
    take: ORDER_SAMPLE,
    select: {
      userId: true,
      guestEmail: true,
      guestName: true,
      totalCents: true,
      currency: true,
      orderNumber: true,
      createdAt: true,
      user: { select: { email: true, name: true, loyaltyTier: true } },
    },
  });

  const byCustomer = new Map<string, CustomerRow>();
  for (const order of orders) {
    const email = order.user?.email ?? order.guestEmail;
    if (!email) continue;
    const key = order.userId ?? `guest:${email.toLowerCase()}`;

    const existing = byCustomer.get(key);
    if (existing) {
      existing.orders += 1;
      existing.totalCents += order.totalCents;
      // Orders arrive newest first, so the first one seen is the latest.
    } else {
      byCustomer.set(key, {
        key,
        email,
        name: order.user?.name ?? order.guestName,
        registered: Boolean(order.userId),
        loyaltyTier: order.user?.loyaltyTier ?? null,
        orders: 1,
        totalCents: order.totalCents,
        currency: order.currency,
        lastOrderAt: order.createdAt,
        lastOrderNumber: order.orderNumber,
      });
    }
  }

  const customers = [...byCustomer.values()]
    .filter(
      (c) =>
        !query ||
        c.email.toLowerCase().includes(query) ||
        (c.name ?? "").toLowerCase().includes(query),
    )
    .sort((a, b) => b.totalCents - a.totalCents);

  return (
    <div className="appear-content">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clienți</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Cine a cumpărat din magazin — conturi și comenzi guest, cu totalul
            cheltuit.
          </p>
        </div>
        <form action="/admin/customers">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Caută după nume sau email…"
            className="h-9 w-64 rounded-lg border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent"
          />
        </form>
      </div>

      {customers.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface-raised p-10 text-center">
          <Users className="mx-auto size-8 text-ink-faint" strokeWidth={1.5} />
          <p className="mt-3 text-ink-muted">
            {query
              ? "Niciun client nu corespunde căutării."
              : "Niciun client încă — apar aici după prima comandă."}
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-surface-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Tip</th>
                <th className="px-4 py-3 font-medium text-right">Comenzi</th>
                <th className="px-4 py-3 font-medium text-right">Total cheltuit</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Ultima comandă
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {customers.map((customer) => (
                <tr key={customer.key} className="transition-colors hover:bg-zinc-50">
                  <td className="max-w-64 px-4 py-3">
                    <p className="truncate font-medium">
                      {customer.name ?? customer.email}
                    </p>
                    {customer.name && (
                      <p className="truncate text-xs text-ink-faint">
                        {customer.email}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {customer.registered ? (
                      <Badge tone="positive">
                        cont{customer.loyaltyTier && customer.loyaltyTier !== "STANDARD"
                          ? ` · ${customer.loyaltyTier}`
                          : ""}
                      </Badge>
                    ) : (
                      <Badge>guest</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {customer.orders}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatMoney(customer.totalCents, customer.currency)}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Link
                      href={`/admin/orders/${customer.lastOrderNumber}`}
                      className="text-ink-muted hover:text-ink hover:underline"
                    >
                      {customer.lastOrderNumber}
                    </Link>
                    <span className="ml-1.5 text-xs text-ink-faint">
                      {new Intl.DateTimeFormat("ro-RO", {
                        dateStyle: "medium",
                      }).format(customer.lastOrderAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
