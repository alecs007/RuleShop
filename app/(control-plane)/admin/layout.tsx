import Link from "next/link";
import { Store, LogOut } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { LogoMark } from "@/components/shop/logo";
import { AdminNav } from "@/components/control-plane/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, storeId } = await requireStaff();
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  return (
    <div className="flex min-h-screen">
      {/* Sidebar: bandă de iconuri pe ecrane mici, cu etichete de la lg in sus */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-14 flex-col border-r border-line bg-surface-raised lg:w-60">
        <div className="flex h-16 items-center justify-center gap-2.5 border-b border-line lg:justify-start lg:px-4">
          <LogoMark alt={store?.name ?? "RuleShop"} />
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-semibold">{store?.name}</p>
            <p className="text-xs text-ink-faint">Control Plane</p>
          </div>
        </div>

        <AdminNav />

        <div className="space-y-1 border-t border-line p-2 lg:p-3">
          <Link
            href="/"
            title="Vezi magazinul"
            className="flex items-center justify-center gap-3 rounded-lg py-2.5 text-sm text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink lg:justify-start lg:px-3"
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
            <button
              title="Deconectare"
              className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg py-2.5 text-sm font-medium text-critical transition-colors hover:bg-red-50 lg:justify-start lg:px-3"
            >
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
      <div className="ml-14 min-w-0 flex-1 lg:ml-60">
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
