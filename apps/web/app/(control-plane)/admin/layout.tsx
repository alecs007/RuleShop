import { requireStaff } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { withFlash } from "@/lib/ui/flash";
import { listAdminStoreOptions } from "@/lib/shop/store-admin";
import { AdminShell } from "@/components/control-plane/admin-shell";
import { selectStoreAction } from "./stores/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role, storeId } = await requireStaff();
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  // Only the platform switches stores; the real guard is on the server, in
  // `selectStoreAction`.
  const platformAdmin = role === "PLATFORM_ADMIN";
  const stores = platformAdmin ? await listAdminStoreOptions(storeId) : [];

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: withFlash("/auth/admin", "signed-out") });
  }

  return (
    <AdminShell
      storeName={store?.name ?? "RuleShop"}
      userLabel={`${user.email} · ${user.role}`}
      signOutAction={signOutAction}
      platformAdmin={platformAdmin}
      stores={stores}
      currentStoreId={storeId}
      selectStoreAction={selectStoreAction}
    >
      {children}
    </AdminShell>
  );
}
