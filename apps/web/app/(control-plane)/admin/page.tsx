import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Boxes,
  Package,
  Scale,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Users,
} from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { DECISION_CATEGORIES } from "@ruleshop/rule-engine";
import { CATEGORY_LABELS } from "@/lib/rules/defaults";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
} from "@ruleshop/storefront";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/control-plane/category-icon";

export const metadata: Metadata = { title: "Dashboard" };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Below this stock a product shows up under "Needs attention". */
const LOW_STOCK = 5;

export default async function AdminDashboard() {
  const { storeId } = await requireStaff();
  const since30d = new Date(Date.now() - 30 * DAY_MS);
  const sinceToday = new Date(new Date().setHours(0, 0, 0, 0));

  const [
    revenue,
    orderCount,
    ordersToday,
    buyers,
    productCount,
    activeProductCount,
    ruleSets,
    recentOrders,
    openIncidents,
    pendingSuggestions,
    lowStock,
    lowStockCount,
  ] = await Promise.all([
    // Revenue: paid or fulfilled orders from the last 30 days.
    prisma.order.aggregate({
      where: {
        storeId,
        status: { in: ["PAID", "FULFILLED"] },
        createdAt: { gte: since30d },
      },
      _sum: { totalCents: true },
      _count: true,
    }),
    prisma.order.count({ where: { storeId } }),
    prisma.order.count({ where: { storeId, createdAt: { gte: sinceToday } } }),
    prisma.order.findMany({
      where: { storeId },
      select: { userId: true, guestEmail: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.product.count({ where: { storeId } }),
    prisma.product.count({ where: { storeId, active: true } }),
    prisma.ruleSet.findMany({
      where: { storeId },
      include: { activeVersion: { select: { version: true } } },
    }),
    prisma.order.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { user: { select: { email: true } } },
    }),
    prisma.fraudIncident.count({ where: { storeId, reviewStatus: "OPEN" } }),
    prisma.aiSuggestion.count({ where: { storeId, status: "PROPOSED" } }),
    prisma.product.findMany({
      where: { storeId, active: true, stock: { lte: LOW_STOCK } },
      orderBy: { stock: "asc" },
      take: 3,
      select: { id: true, name: true, stock: true },
    }),
    prisma.product.count({
      where: { storeId, active: true, stock: { lte: LOW_STOCK } },
    }),
  ]);

  const customerCount = new Set(
    buyers.map((o) => o.userId ?? o.guestEmail?.toLowerCase()).filter(Boolean),
  ).size;
  const currency = recentOrders[0]?.currency ?? "RON";
  const setsByCategory = new Map(ruleSets.map((rs) => [rs.category, rs]));
  const killSwitched = ruleSets.filter((rs) => rs.killSwitch);

  const stats = [
    {
      label: "Vânzări (30 zile)",
      value: formatMoney(revenue._sum.totalCents ?? 0, currency),
      hint: `${revenue._count} ${revenue._count === 1 ? "comandă încasată" : "comenzi încasate"}`,
      icon: Banknote,
      href: "/admin/orders?status=PAID",
    },
    {
      label: "Comenzi",
      value: String(orderCount),
      hint: ordersToday > 0 ? `${ordersToday} astăzi` : "niciuna astăzi",
      icon: ShoppingCart,
      href: "/admin/orders",
    },
    {
      label: "Clienți",
      value: String(customerCount),
      hint: "conturi și guest",
      icon: Users,
      href: "/admin/customers",
    },
    {
      label: "Produse",
      value: String(activeProductCount),
      hint: `${productCount} în total`,
      icon: Package,
      href: "/admin/products",
    },
  ];

  const todo = [
    openIncidents > 0 && {
      href: "/admin/fraud",
      icon: ShieldAlert,
      label: `${openIncidents} ${openIncidents === 1 ? "incident antifraudă așteaptă" : "incidente antifraudă așteaptă"} verificare`,
    },
    pendingSuggestions > 0 && {
      href: "/admin/rules",
      icon: Sparkles,
      label: `${pendingSuggestions} ${pendingSuggestions === 1 ? "sugestie AI așteaptă" : "sugestii AI așteaptă"} decizia ta`,
    },
    lowStockCount > 0 && {
      href: "/admin/products",
      icon: Boxes,
      label: `${lowStockCount} ${lowStockCount === 1 ? "produs cu stoc mic" : "produse cu stoc mic"}: ${lowStock
        .map((p) => `${p.name} (${p.stock})`)
        .join(", ")}${lowStockCount > lowStock.length ? "…" : ""}`,
    },
  ].filter(Boolean) as { href: string; icon: typeof Boxes; label: string }[];

  return (
    <div className="appear-content">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Starea magazinului și a motorului de reguli.
      </p>

      {/* Active kill switches, ahead of anything else */}
      {killSwitched.length > 0 && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="font-medium text-critical">Kill switch activ</p>
          <p className="mt-1 text-sm text-ink-muted">
            {killSwitched.map((rs) => CATEGORY_LABELS[rs.category]).join(", ")} —
            deciziile cad pe valorile implicite.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, hint, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <div className="h-full rounded-xl border border-line bg-surface-raised p-5 transition-colors hover:border-ink-faint">
              <div className="flex items-center justify-between">
                <p className="text-sm text-ink-muted">{label}</p>
                <Icon className="size-4 text-ink-faint" strokeWidth={1.75} />
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
              <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>
            </div>
          </Link>
        ))}
      </div>

      {todo.length > 0 && (
        <div className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
          <h2 className="font-semibold">De rezolvat</h2>
          <ul className="mt-3 space-y-2">
            {todo.map(({ href, icon: Icon, label }) => (
              <li key={href + label}>
                <Link
                  href={href}
                  className="group flex items-start gap-2.5 text-sm text-ink-muted transition-colors hover:text-ink"
                >
                  <Icon
                    className="mt-0.5 size-4 shrink-0 text-caution"
                    strokeWidth={1.75}
                  />
                  <span>{label}</span>
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-line bg-surface-raised">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="font-semibold">Ultimele comenzi</h2>
            <Link
              href="/admin/orders"
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              Vezi toate
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="px-5 pb-5 pt-3 text-sm text-ink-muted">
              Nicio comandă încă — apar aici imediat ce clienții cumpără.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.orderNumber}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-zinc-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {order.orderNumber}
                        <span className="ml-2 font-normal text-ink-faint">
                          {order.user?.email ?? order.guestEmail ?? "—"}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {new Intl.DateTimeFormat("ro-RO", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(order.placedAt ?? order.createdAt)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {formatMoney(order.totalCents, order.currency)}
                    </span>
                    <Badge tone={ORDER_STATUS_TONES[order.status]}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="h-fit rounded-xl border border-line bg-surface-raised p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Motorul de reguli</h2>
            <Link
              href="/admin/rules"
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              <Scale className="size-4" strokeWidth={1.75} />
            </Link>
          </div>
          <ul className="mt-3 space-y-1">
            {DECISION_CATEGORIES.map((category) => {
              const set = setsByCategory.get(category);
              return (
                <li key={category}>
                  <Link
                    href={`/admin/rules/${category.toLowerCase()}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-zinc-50"
                  >
                    <CategoryIcon
                      category={category}
                      className="size-4 shrink-0 text-accent"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {CATEGORY_LABELS[category]}
                    </span>
                    {set?.killSwitch ? (
                      <Badge tone="critical">oprit</Badge>
                    ) : set?.activeVersion ? (
                      <Badge tone="positive">v{set.activeVersion.version}</Badge>
                    ) : (
                      <Badge>nepublicat</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
