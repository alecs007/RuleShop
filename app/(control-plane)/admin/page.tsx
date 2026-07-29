import type { Metadata } from "next";
import Link from "next/link";
import { Package, Scale, ShoppingCart, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const { storeId } = await requireStaff();

  const [productCount, activeProductCount, orderCount, cartCount, ruleSets] =
    await Promise.all([
      prisma.product.count({ where: { storeId } }),
      prisma.product.count({ where: { storeId, active: true } }),
      prisma.order.count({ where: { storeId } }),
      prisma.cart.count({ where: { storeId } }),
      prisma.ruleSet.findMany({
        where: { storeId },
        include: { activeVersion: { select: { version: true } } },
      }),
    ]);

  const publishedSets = ruleSets.filter((rs) => rs.activeVersion);

  const stats = [
    {
      label: "Produse",
      value: `${activeProductCount} active / ${productCount}`,
      icon: Package,
      href: "/admin/products",
    },
    { label: "Comenzi", value: String(orderCount), icon: ShoppingCart },
    { label: "Coșuri active", value: String(cartCount), icon: Users },
    {
      label: "Ruleset-uri publicate",
      value: `${publishedSets.length} / ${ruleSets.length || "6"}`,
      icon: Scale,
      href: "/admin/rules",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Starea magazinului și a motorului de reguli.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href }) => {
          const card = (
            <div className="rounded-xl border border-line bg-surface-raised p-5 transition-colors hover:border-ink-faint">
              <div className="flex items-center justify-between">
                <p className="text-sm text-ink-muted">{label}</p>
                <Icon className="size-4 text-ink-faint" strokeWidth={1.75} />
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
            </div>
          );
          return href ? (
            <Link key={label} href={href}>{card}</Link>
          ) : (
            <div key={label}>{card}</div>
          );
        })}
      </div>

      {/* Kill switch-uri active — vizibile imediat */}
      {ruleSets.some((rs) => rs.killSwitch) && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="font-medium text-critical">Kill switch activ</p>
          <p className="mt-1 text-sm text-ink-muted">
            {ruleSets
              .filter((rs) => rs.killSwitch)
              .map((rs) => rs.category)
              .join(", ")}{" "}
            — deciziile cad pe valorile implicite.
          </p>
        </div>
      )}
    </div>
  );
}
