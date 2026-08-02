import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  NEW_ARRIVAL_DAYS,
  type CatalogSelection,
  type CatalogSort,
} from "@ruleshop/storefront";

export const PRODUCT_SORTS = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  "price-asc": { basePriceCents: "asc" },
  "price-desc": { basePriceCents: "desc" },
  name: { name: "asc" },
  "name-desc": { name: "desc" },
} satisfies Record<CatalogSort, Prisma.ProductOrderByWithRelationInput>;

export type ProductSort = CatalogSort;

export type CatalogQuery = Partial<CatalogSelection> & {
  pageSize?: number;
  /** Products pulled from the catalog by AVAILABILITY rules. */
  excludeIds?: string[];
};

/** Translates the filter selection into the catalog's Prisma `where`. */
function catalogWhere(
  storeId: string,
  query: CatalogQuery,
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  // Applied before pagination, or counts and pages would be wrong.
  if (query.excludeIds?.length) and.push({ id: { notIn: query.excludeIds } });
  if (query.categories?.length) and.push({ category: { in: query.categories } });
  if (query.brands?.length) and.push({ brand: { in: query.brands } });
  // `hasSome`: the product passes with at least one of the tags asked for.
  if (query.tags?.length) and.push({ tags: { hasSome: query.tags } });
  if (query.inStockOnly) and.push({ stock: { gt: 0 } });

  if (query.newOnly) {
    const since = new Date(Date.now() - NEW_ARRIVAL_DAYS * 86_400_000);
    and.push({ createdAt: { gte: since } });
  }

  // Bounds arrive in major units; the database stores minor ones.
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

/** A store's catalog: search, filter, sort, paginate. */
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

/** The categories present in the catalog. */
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

/** Everything the filter panel needs to draw itself. */
export interface CatalogFacets {
  categories: FacetOption[];
  brands: FacetOption[];
  tags: FacetOption[];
  /** The catalog's real price range, rounded outwards. */
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
    // Most frequent first, then alphabetical, so the list stays stable.
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ro"));
}

/**
 * Computed over the whole active catalog, not the filtered result: otherwise
 * options would vanish as the user filters and they could not go back.
 */
export async function getCatalogFacets(
  storeId: string,
  excludeIds: string[] = [],
): Promise<CatalogFacets> {
  const rows = await prisma.product.findMany({
    where: {
      storeId,
      active: true,
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    },
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

export async function getFeaturedProducts(
  storeId: string,
  take = 8,
  excludeIds: string[] = [],
) {
  return prisma.product.findMany({
    where: {
      storeId,
      active: true,
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}
