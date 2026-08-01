import { Suspense } from "react";
import { Header } from "@/components/shop/header";
import { Footer } from "@/components/shop/footer";
import { ThemeBanner } from "@/components/shop/theme-banner";
import { getActiveStore } from "@/lib/shop/store";
import { getThemeView } from "@/lib/shop/theme";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await getActiveStore();
  // Singurul loc care inregistreaza evaluarea THEME in istoric: o data pe pagina.
  const theme = await getThemeView(store.id, "layout");

  return (
    <div
      // Tokenurile devin proprietati CSS custom pe acest element si se moștenesc
      // in tot magazinul. `bg-surface` e necesar aici: fundalul paginii vine
      // normal de pe `body`, care e ascendent și nu ar vedea suprascrierea.
      style={theme.cssVariables as React.CSSProperties}
      data-layout={theme.layoutVariant}
      className="flex min-h-screen flex-col bg-surface"
    >
      {theme.banner && <ThemeBanner message={theme.banner} />}
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
