import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getCategories } from "@/lib/shop/products";
import { ProductForm } from "@/components/control-plane/product-form";
import { deleteProductAction, updateProductAction } from "../actions";

export const metadata: Metadata = { title: "Editează produs" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { storeId } = await requireAdmin();

  const [product, categories] = await Promise.all([
    prisma.product.findFirst({ where: { id, storeId } }),
    getCategories(storeId),
  ]);
  if (!product) notFound();

  const updateWithId = updateProductAction.bind(null, product.id);

  return (
    <div className="appear-content">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {product.sku} · creat{" "}
            {new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(product.createdAt)}
          </p>
        </div>
        <form action={deleteProductAction}>
          <input type="hidden" name="productId" value={product.id} />
          <button className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-critical transition-colors hover:bg-red-50">
            Șterge definitiv
          </button>
        </form>
      </div>

      <div className="mt-6">
        <ProductForm
          action={updateWithId}
          product={product}
          categories={categories}
        />
      </div>
    </div>
  );
}
