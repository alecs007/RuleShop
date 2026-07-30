import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Pencil, Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { toggleProductAction } from "./actions";

export const metadata: Metadata = { title: "Produse" };

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { storeId } = await requireStaff();
  const { q } = await searchParams;

  const products = await prisma.product.findMany({
    where: {
      storeId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produse</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Catalog, prețuri de bază și stoc. Prețurile finale le decide rule engine-ul.
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          <Plus className="size-4" /> Produs nou
        </Link>
      </div>

      <form className="mt-6">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Caută după nume, SKU sau categorie…"
          className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface-raised px-3 text-sm outline-none transition-colors focus:border-accent"
        />
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface-raised">
        {/* Pe telefon rămân produsul, prețul si actiunile; restul se mută sub nume */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-medium">Produs</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Categorie
              </th>
              <th className="px-4 py-3 font-medium">Preț de bază</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Stoc</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Stare</th>
              <th className="px-4 py-3 font-medium text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((product) => (
              <tr key={product.id} className="transition-colors hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                      {product.imageUrls[0] && (
                        <Image
                          src={product.imageUrls[0]}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="text-xs text-ink-faint">
                        {product.sku}
                        <span className="lg:hidden"> · {product.category}</span>
                      </p>
                      {/* Stoc si stare, cand nu au coloane proprii */}
                      <p className="mt-1 flex items-center gap-1.5 sm:hidden">
                        <span className="text-xs text-ink-faint tabular-nums">
                          stoc {product.stock}
                        </span>
                        {product.active ? (
                          <Badge tone="positive">Activ</Badge>
                        ) : (
                          <Badge>Inactiv</Badge>
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 capitalize text-ink-muted lg:table-cell">
                  {product.category}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatMoney(product.basePriceCents, product.currency)}
                </td>
                <td className="hidden px-4 py-3 tabular-nums sm:table-cell">
                  {product.stock === 0 ? (
                    <Badge tone="critical">0</Badge>
                  ) : product.stock <= 5 ? (
                    <Badge tone="caution">{product.stock}</Badge>
                  ) : (
                    product.stock
                  )}
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <form action={toggleProductAction}>
                    <input type="hidden" name="productId" value={product.id} />
                    <button
                      className="cursor-pointer"
                      title={product.active ? "Dezactivează" : "Activează"}
                    >
                      {product.active ? (
                        <Badge tone="positive">Activ</Badge>
                      ) : (
                        <Badge>Inactiv</Badge>
                      )}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink"
                    aria-label={`Editează ${product.name}`}
                  >
                    <Pencil className="size-4" strokeWidth={1.75} />
                  </Link>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-muted">
                  Niciun produs găsit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
