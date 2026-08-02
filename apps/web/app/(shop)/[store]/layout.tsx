import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Header } from "@/components/shop/header";
import { Footer } from "@/components/shop/footer";
import { ThemeBanner } from "@/components/shop/theme-banner";
import { StoreClosed } from "@/components/shop/store-closed";
import { getStoreBySegment } from "@/lib/shop/store";
import { getThemeView } from "@/lib/shop/theme";

/**
 * The storefront wrapper. The request's store is resolved once, from the path
 * segment, and passed on explicitly: there is no ambient "current store", so
 * two requests for different stores can be served in parallel.
 *
 * Three states, not two: an unknown prefix (404), a stopped store (the closed
 * page) and a running one. Every store can be stopped at once.
 */
export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ store: string }>;
}) {
  const { store: segment } = await params;
  const store = await getStoreBySegment(segment);

  if (!store) notFound();
  if (!store.active) return <StoreClosed storeName={store.name} />;

  // The only place the THEME evaluation is recorded: once per page.
  const theme = await getThemeView(store.id, "layout");

  return (
    <div
      // The tokens become custom CSS properties here and are inherited by the
      // whole storefront. `bg-surface` is needed because the page background
      // normally comes from `body`, an ancestor that would not see them.
      style={theme.cssVariables as React.CSSProperties}
      data-layout={theme.layoutVariant}
      className="flex min-h-screen flex-col bg-surface"
    >
      {theme.banner && <ThemeBanner message={theme.banner} />}
      <Suspense>
        <Header store={store} />
      </Suspense>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6">
        {children}
      </main>
      <Footer storeName={store.name} prefix={store.pathPrefix} />
    </div>
  );
}
