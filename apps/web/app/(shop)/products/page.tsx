import type { Metadata } from "next";
import Link from "next/link";
import { getActiveStore } from "@/lib/shop/store";
import { getCatalogFacets, queryCatalog } from "@/lib/shop/products";
import {
  catalogHref,
  catalogSearchParams,
  hasActiveFilters,
  parseCatalogSelection,
  EMPTY_SELECTION,
} from "@/lib/shop/catalog-params";
import { getPriceViews } from "@/lib/shop/pricing";
import {
  getAvailabilityViews,
  getHiddenProductIds,
} from "@/lib/shop/availability";
import { getThemeView } from "@/lib/shop/theme";
import { CATALOG_GRID_CLASSES } from "@/lib/shop/theme-view";
import { ProductCard } from "@/components/shop/product-card";
import { CatalogFilters } from "@/components/shop/catalog-filters";
import { AppearItem, AppearList } from "@/components/ui/appear";

export const metadata: Metadata = { title: "Produse" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const store = await getActiveStore();
  const selection = parseCatalogSelection(params);

  // Produsele ascunse de regulile AVAILABILITY ies din catalog inaintea
  // paginarii si a numaratorilor, ca si cum nu ar exista.
  const hiddenIds = await getHiddenProductIds(store.id);
  const [result, facets] = await Promise.all([
    queryCatalog(store.id, { ...selection, excludeIds: hiddenIds }),
    getCatalogFacets(store.id, hiddenIds),
  ]);
  const [prices, availability, theme] = await Promise.all([
    getPriceViews(result.products),
    getAvailabilityViews(result.products),
    // Aceeasi evaluare THEME ca in layout (cache per request) — decide doar
    // densitatea grilei; restul temei se aplica mai sus.
    getThemeView(store.id),
  ]);

  const singleCategory =
    selection.categories.length === 1 ? selection.categories[0] : null;

  return (
    <div className="appear-content py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {selection.q ? (
            `Rezultate pentru „${selection.q}"`
          ) : singleCategory ? (
            <span className="capitalize">{singleCategory}</span>
          ) : (
            "Toate produsele"
          )}
        </h1>
        <p className="text-sm text-ink-muted">
          {result.total} {result.total === 1 ? "produs" : "produse"}
          {hasActiveFilters(selection) && facets.total > result.total && (
            <span className="text-ink-faint"> din {facets.total}</span>
          )}
        </p>
      </div>

      <div className="mt-6">
        <CatalogFilters facets={facets} />
      </div>

      {result.products.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-ink-muted">
            Niciun produs nu corespunde căutării.
          </p>
          <Link
            href={catalogHref({ ...EMPTY_SELECTION, q: selection.q })}
            className="mt-2 inline-block text-sm text-accent hover:underline"
          >
            Resetează filtrele
          </Link>
        </div>
      ) : (
        <AppearList
          // Orice schimbare de filtru, sortare sau pagină redă intrarea cardurilor.
          resetKey={catalogSearchParams(selection).toString()}
          className={`mt-6 ${CATALOG_GRID_CLASSES[theme.layoutVariant]}`}
        >
          {result.products.map((product, index) => (
            <AppearItem key={product.id} index={index} className="h-full">
              <ProductCard
                product={product}
                price={prices.get(product.id)!}
                availability={availability.get(product.id)}
              />
            </AppearItem>
          ))}
        </AppearList>
      )}

      {/* Paginare */}
      {result.pageCount > 1 && (
        <nav
          className="mt-10 flex items-center justify-center gap-2"
          aria-label="Paginare"
        >
          {Array.from({ length: result.pageCount }, (_, i) => i + 1).map(
            (p) => (
              <Link
                key={p}
                href={catalogHref({ ...selection, page: p })}
                aria-current={p === result.page ? "page" : undefined}
                className={
                  p === result.page
                    ? "flex size-9 items-center justify-center rounded-lg bg-ink text-sm font-medium text-white"
                    : "flex size-9 items-center justify-center rounded-lg border border-line text-sm transition-colors hover:border-ink-faint"
                }
              >
                {p}
              </Link>
            ),
          )}
        </nav>
      )}
    </div>
  );
}
