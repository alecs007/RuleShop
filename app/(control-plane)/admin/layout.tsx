import Link from "next/link";
import { LayoutDashboard, Package, Scale, Store, LogOut } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { LogoMark } from "@/components/shop/logo";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/products", label: "Produse", icon: Package },
  { href: "/admin/rules", label: "Reguli", icon: Scale },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, storeId } = await requireStaff();
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col border-r border-line bg-surface-raised lg:w-60">
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
          <LogoMark alt={store?.name ?? "RuleShop"} />
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-semibold">{store?.name}</p>
            <p className="text-xs text-ink-faint">Control Plane</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-2 lg:p-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink"
            >
              <Icon className="size-5 shrink-0" strokeWidth={1.75} />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="space-y-1 border-t border-line p-2 lg:p-3">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink"
          >
            <Store className="size-5 shrink-0" strokeWidth={1.75} />
            <span className="hidden lg:inline">Vezi magazinul</span>
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/auth/admin" });
            }}
          >
            <button className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-critical transition-colors hover:bg-red-50">
              <LogOut className="size-5 shrink-0" strokeWidth={1.75} />
              <span className="hidden lg:inline">Deconectare</span>
            </button>
          </form>
          <p className="hidden truncate px-3 pb-1 text-xs text-ink-faint lg:block">
            {user.email} · {user.role}
          </p>
        </div>
      </aside>

      {/* Continut */}
      <div className="ml-16 flex-1 lg:ml-60">
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
