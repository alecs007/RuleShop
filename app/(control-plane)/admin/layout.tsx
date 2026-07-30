import { requireStaff } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { AdminShell } from "@/components/control-plane/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, storeId } = await requireStaff();
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/auth/admin" });
  }

  return (
    <AdminShell
      storeName={store?.name ?? "RuleShop"}
      userLabel={`${user.email} · ${user.role}`}
      signOutAction={signOutAction}
    >
      {children}
    </AdminShell>
  );
}
