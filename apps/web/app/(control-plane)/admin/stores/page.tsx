import type { Metadata } from "next";
import { Store } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { listStoresWithCounts } from "@/lib/shop/store-admin";
import {
  StoreManager,
  type StoreRow,
} from "@/components/control-plane/store-manager";
import {
  createStoreAction,
  selectStoreAction,
  setDefaultStoreAction,
  setStoreActiveAction,
} from "./actions";

export const metadata: Metadata = { title: "Magazine" };

export default async function AdminStoresPage() {
  // Doar platforma: un STORE_ADMIN administreaza magazinul lui, nu lista lor.
  const { storeId } = await requirePlatformAdmin();
  const stores = await listStoresWithCounts();

  const rows: StoreRow[] = stores.map((store) => ({
    id: store.id,
    name: store.name,
    slug: store.slug,
    currency: store.currency,
    locale: store.locale,
    active: store.active,
    isDefault: store.isDefault,
    products: store._count.products,
    orders: store._count.orders,
  }));

  return (
    <div className="appear-content">
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
        <Store className="size-6 text-accent" strokeWidth={1.75} />
        Magazine
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Fiecare magazin are propriul catalog, propriile reguli și propriile
        comenzi — izolate complet. „Activ” e magazinul pe care îl văd clienții;
        „administrezi” e cel pe care lucrezi acum în panou. Sunt lucruri diferite:
        poți pregăti un magazin nou fără ca vizitatorii să vadă nimic. Un magazin
        „oprit” nu se servește nimănui și nu poate fi administrat.
      </p>

      <StoreManager
        stores={rows}
        currentStoreId={storeId}
        envOverrideSlug={process.env.DEFAULT_STORE_SLUG}
        createAction={createStoreAction}
        selectAction={selectStoreAction}
        setDefaultAction={setDefaultStoreAction}
        setActiveAction={setStoreActiveAction}
      />
    </div>
  );
}
