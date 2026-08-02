import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import type { OrderStatus, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
} from "@ruleshop/storefront";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Comenzi" };

const PAGE_SIZE = 20;
const STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

function isStatus(raw: string | undefined): raw is OrderStatus {
  return !!raw && (STATUSES as string[]).includes(raw);
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { storeId } = await requireStaff();
  const params = await searchParams;
  const status = isStatus(params.status) ? params.status : undefined;
  const q = params.q?.trim() || undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.OrderWhereInput = {
    storeId,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { guestEmail: { contains: q, mode: "insensitive" } },
            { guestName: { contains: q, mode: "insensitive" } },
            { user: { is: { email: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [orders, total, statusCounts] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { email: true, name: true } },
        items: { select: { quantity: true } },
      },
    }),
    prisma.order.count({ where }),
    Promise.all(
      STATUSES.map(async (s) => ({
        status: s,
        count: await prisma.order.count({ where: { storeId, status: s } }),
      })),
    ),
  ]);
  const allCount = statusCounts.reduce((sum, s) => sum + s.count, 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefFor = (overrides: { status?: OrderStatus; page?: number }) => {
    const search = new URLSearchParams();
    const nextStatus = "status" in overrides ? overrides.status : status;
    if (nextStatus) search.set("status", nextStatus);
    if (q) search.set("q", q);
    if (overrides.page && overrides.page > 1) search.set("page", String(overrides.page));
    const qs = search.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  const chipCls = (active: boolean) =>
    active
      ? "inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-white"
      : "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink";

  return (
    <div className="appear-content">
      <h1 className="text-2xl font-semibold tracking-tight">Comenzi</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Toate comenzile magazinului, cu statusul și deciziile care le-au produs.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href={hrefFor({ status: undefined })} className={chipCls(!status)}>
          Toate <span className="tabular-nums opacity-70">{allCount}</span>
        </Link>
        {statusCounts
          .filter((s) => s.count > 0)
          .map((s) => (
            <Link
              key={s.status}
              href={hrefFor({ status: s.status })}
              className={chipCls(status === s.status)}
            >
              {ORDER_STATUS_LABELS[s.status]}{" "}
              <span className="tabular-nums opacity-70">{s.count}</span>
            </Link>
          ))}
        <form className="ml-auto" action="/admin/orders">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Caută după număr sau email…"
            className="h-9 w-64 rounded-lg border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent"
          />
        </form>
      </div>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface-raised p-10 text-center">
          <ShoppingCart className="mx-auto size-8 text-ink-faint" strokeWidth={1.5} />
          <p className="mt-3 text-ink-muted">
            {q || status
              ? "Nicio comandă nu corespunde filtrării."
              : "Nicio comandă încă."}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3 font-medium">Comandă</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Client</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Produse</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((order) => {
                const clientLabel =
                  order.user?.email ?? order.guestEmail ?? "—";
                const itemCount = order.items.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                );
                const placed = new Intl.DateTimeFormat("ro-RO", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(order.placedAt ?? order.createdAt);
                return (
                  <tr key={order.id} className="transition-colors hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${order.orderNumber}`}
                        className="font-medium hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-faint">{placed}</p>
                      {/* The customer, recovered on small screens */}
                      <p className="mt-0.5 truncate text-xs text-ink-faint md:hidden">
                        {clientLabel}
                      </p>
                    </td>
                    <td className="hidden max-w-56 px-4 py-3 md:table-cell">
                      <p className="truncate">{clientLabel}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {order.user ? "cont" : "guest"}
                        {order.riskScore > 0 && ` · risc ${order.riskScore}`}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-ink-muted sm:table-cell">
                      {itemCount}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatMoney(order.totalCents, order.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ORDER_STATUS_TONES[order.status]}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav
          className="mt-6 flex items-center justify-center gap-2"
          aria-label="Paginare"
        >
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={hrefFor({ page: p })}
              aria-current={p === page ? "page" : undefined}
              className={
                p === page
                  ? "flex size-9 items-center justify-center rounded-lg bg-ink text-sm font-medium text-white"
                  : "flex size-9 items-center justify-center rounded-lg border border-line text-sm transition-colors hover:border-ink-faint"
              }
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
