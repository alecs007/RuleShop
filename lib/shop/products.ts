import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const PRODUCT_SORTS = {
  newest: { createdAt: "desc" },
  "price-asc": { basePriceCents: "asc" },
  "price-desc": { basePriceCents: "desc" },
  name: { name: "asc" },
} satisfies Record<string, Prisma.ProductOrderByWithRelationInput>;

export type ProductSort = keyof typeof PRODUCT_SORTS;

export interface CatalogQuery {
  q?: string;
  category?: string;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

/** Catalogul unui magazin: cautare + filtrare + sortare + paginare. */
export async function queryCatalog(storeId: string, query: CatalogQuery) {
  const pageSize = query.pageSize ?? 12;
  const page = Math.max(1, query.page ?? 1);

  const where: Prisma.ProductWhereInput = {
    storeId,
    active: true,
    ...(query.category ? { category: query.category } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { description: { contains: query.q, mode: "insensitive" } },
            { brand: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

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
