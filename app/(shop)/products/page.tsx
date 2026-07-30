import type { Metadata } from "next";
import Link from "next/link";
import { getActiveStore } from "@/lib/shop/store";
import {
  getCategories,
  queryCatalog,
  PRODUCT_SORTS,
  type ProductSort,
} from "@/lib/shop/products";
import { getPriceViews } from "@/lib/shop/pricing";
import { ProductCard } from "@/components/shop/product-card";
import { CatalogFilters } from "@/components/shop/catalog-filters";
import { AppearItem, AppearList } from "@/components/ui/appear";

export const metadata: Metadata = { title: "Produse" };

interface SearchParams {
  q?: string;
  category?: string;
  sort?: string;
  page?: string;
}

function isSort(value: string | undefined): value is ProductSort {
  return value !== undefined && value in PRODUCT_SORTS;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const store = await getActiveStore();

  const sort = isSort(params.sort) ? params.sort : "newest";
  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  const [result, categories] = await Promise.all([
    queryCatalog(store.id, {
      q: params.q,
      category: params.category,
      sort,
      page,
    }),
    getCategories(store.id),
  ]);
  const prices = await getPriceViews(result.products);

  const buildPageUrl = (p: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.category) next.set("category", params.category);
    if (params.sort) next.set("sort", params.sort);
    if (p > 1) next.set("page", String(p));
    return `/products${next.size ? `?${next}` : ""}`;
  };

  return (
    <div className="py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {params.q ? `Rezultate pentru „${params.q}"` : params.category ? (
            <span className="capitalize">{params.category}</span>
          ) : (
            "Toate produsele"
          )}
        </h1>
        <p className="text-sm text-ink-muted">
          {result.total} {result.total === 1 ? "produs" : "produse"}
        </p>
      </div>

      <div className="mt-6">
        <CatalogFilters categories={categories} />
      </div>

      {result.products.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-ink-muted">Niciun produs nu corespunde căutării.</p>
          <Link href="/products" className="mt-2 inline-block text-sm text-accent hover:underline">
            Resetează filtrele
          </Link>
        </div>
      ) : (
        <AppearList
          // Orice schimbare de filtru, sortare sau pagină redă intrarea cardurilor.
          resetKey={`${params.category ?? ""}|${params.q ?? ""}|${sort}|${page}`}
          className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {result.products.map((product, index) => (
            <AppearItem key={product.id} index={index} className="h-full">
              <ProductCard
                product={product}
                price={prices.get(product.id)!}
              />
            </AppearItem>
          ))}
        </AppearList>
      )}

      {/* Paginare */}
      {result.pageCount > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Paginare">
          {Array.from({ length: result.pageCount }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={buildPageUrl(p)}
              aria-current={p === result.page ? "page" : undefined}
              className={
                p === result.page
                  ? "flex size-9 items-center justify-center rounded-lg bg-ink text-sm font-medium text-white"
                  : "flex size-9 items-center justify-center rounded-lg border border-line text-sm transition-colors hover:border-ink-faint"
              }
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
