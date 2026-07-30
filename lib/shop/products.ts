import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  NEW_ARRIVAL_DAYS,
  type CatalogSelection,
  type CatalogSort,
} from "./catalog-params";

export const PRODUCT_SORTS = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  "price-asc": { basePriceCents: "asc" },
  "price-desc": { basePriceCents: "desc" },
  name: { name: "asc" },
  "name-desc": { name: "desc" },
} satisfies Record<CatalogSort, Prisma.ProductOrderByWithRelationInput>;

export type ProductSort = CatalogSort;

export type CatalogQuery = Partial<CatalogSelection> & { pageSize?: number };

/** Traduce selectia de filtre in `where`-ul Prisma al catalogului public. */
function catalogWhere(
  storeId: string,
  query: CatalogQuery,
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (query.categories?.length) and.push({ category: { in: query.categories } });
  if (query.brands?.length) and.push({ brand: { in: query.brands } });
  // `hasSome`: produsul trece daca are cel putin una din etichetele cerute.
  if (query.tags?.length) and.push({ tags: { hasSome: query.tags } });
  if (query.inStockOnly) and.push({ stock: { gt: 0 } });

  if (query.newOnly) {
    const since = new Date(Date.now() - NEW_ARRIVAL_DAYS * 86_400_000);
    and.push({ createdAt: { gte: since } });
  }

  // Pragurile vin in lei, baza de date tine bani.
  if (query.minPrice != null) {
    and.push({ basePriceCents: { gte: Math.round(query.minPrice * 100) } });
  }
  if (query.maxPrice != null) {
    and.push({ basePriceCents: { lte: Math.round(query.maxPrice * 100) } });
  }

  if (query.q) {
    and.push({
      OR: [
        { name: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
        { brand: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  return {
    storeId,
    active: true,
    ...(and.length ? { AND: and } : {}),
  };
}

/** Catalogul unui magazin: cautare + filtrare + sortare + paginare. */
export async function queryCatalog(storeId: string, query: CatalogQuery) {
  const pageSize = query.pageSize ?? 12;
  const page = Math.max(1, query.page ?? 1);
  const where = catalogWhere(storeId, query);

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: PRODUCT_SORTS[query.sort ?? "newest"],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Categoriile existente in catalog (pentru navigare si filtre). */
export async function getCategories(storeId: string): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { storeId, active: true },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category);
}

export interface FacetOption {
  value: string;
  count: number;
}

/** Tot ce are nevoie panoul de filtre pentru a se desena singur. */
export interface CatalogFacets {
  categories: FacetOption[];
  brands: FacetOption[];
  tags: FacetOption[];
  /** Intervalul real de preț din catalog, in lei (rotunjit spre exterior). */
  minPrice: number;
  maxPrice: number;
  inStockCount: number;
  newCount: number;
  total: number;
}

function tally(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toOptions(map: Map<string, number>): FacetOption[] {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    // Intai cele mai frecvente, apoi alfabetic — lista rămâne stabila.
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ro"));
}

/**
 * Valorile disponibile pentru filtrare, calculate peste tot catalogul activ
 * (nu peste rezultatul filtrat) — altfel opțiunile ar dispărea pe măsură ce
 * utilizatorul filtrează și nu ar mai putea reveni.
 */
export async function getCatalogFacets(storeId: string): Promise<CatalogFacets> {
  const rows = await prisma.product.findMany({
    where: { storeId, active: true },
    select: {
      category: true,
      brand: true,
      tags: true,
      basePriceCents: true,
      stock: true,
      createdAt: true,
    },
  });

  const categories = new Map<string, number>();
  const brands = new Map<string, number>();
  const tags = new Map<string, number>();
  const newSince = Date.now() - NEW_ARRIVAL_DAYS * 86_400_000;

  let minCents = Number.POSITIVE_INFINITY;
  let maxCents = 0;
  let inStockCount = 0;
  let newCount = 0;

  for (const row of rows) {
    tally(categories, row.category);
    if (row.brand) tally(brands, row.brand);
    for (const tag of row.tags) tally(tags, tag);
    minCents = Math.min(minCents, row.basePriceCents);
    maxCents = Math.max(maxCents, row.basePriceCents);
    if (row.stock > 0) inStockCount += 1;
    if (row.createdAt.getTime() >= newSince) newCount += 1;
  }

  return {
    categories: toOptions(categories),
    brands: toOptions(brands),
    tags: toOptions(tags),
    minPrice: rows.length ? Math.floor(minCents / 100) : 0,
    maxPrice: rows.length ? Math.ceil(maxCents / 100) : 0,
    inStockCount,
    newCount,
    total: rows.length,
  };
}

export async function getProductBySlug(storeId: string, slug: string) {
  return prisma.product.findUnique({
    where: { storeId_slug: { storeId, slug } },
  });
}

export async function getFeaturedProducts(storeId: string, take = 8) {
  return prisma.product.findMany({
    where: { storeId, active: true },
    orderBy: { createdAt: "desc" },
    take,
  });
}
