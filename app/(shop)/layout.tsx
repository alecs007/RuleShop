import { Suspense } from "react";
import { Header } from "@/components/shop/header";
import { Footer } from "@/components/shop/footer";
import { getActiveStore } from "@/lib/shop/store";

export const dynamic = "force-dynamic";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await getActiveStore();

  return (
    <div className="flex min-h-screen flex-col">
      <Suspense>
        <Header />
      </Suspense>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6">
        {children}
      </main>
      <Footer storeName={store.name} />
    </div>
  );
}
