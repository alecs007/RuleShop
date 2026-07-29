import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { getCategories } from "@/lib/shop/products";
import { ProductForm } from "@/components/control-plane/product-form";
import { createProductAction } from "../actions";

export const metadata: Metadata = { title: "Produs nou" };

export default async function NewProductPage() {
  const { storeId } = await requireAdmin();
  const categories = await getCategories(storeId);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Produs nou</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Produsul apare imediat în magazin după salvare.
      </p>
      <div className="mt-6">
        <ProductForm action={createProductAction} categories={categories} />
      </div>
    </div>
  );
}
