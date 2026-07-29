"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Product } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ProductFormState } from "@/app/(control-plane)/admin/products/actions";

type FormAction = (
  prev: ProductFormState | undefined,
  formData: FormData,
) => Promise<ProductFormState>;

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-xs text-critical">{error}</p>}
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent focus:bg-surface-raised";

/**
 * Formular de produs (creare + editare). Categoriile existente sunt oferite
 * ca sugestii (datalist) — o categorie noua se creeaza pur si simplu
 * scriind-o aici.
 */
export function ProductForm({
  action,
  product,
  categories,
}: {
  action: FormAction;
  product?: Product;
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState<
    ProductFormState | undefined,
    FormData
  >(action, undefined);
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {state?.message && !state.ok && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-critical">
          {state.message}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nume" name="name" error={errors.name}>
          <input
            id="name"
            name="name"
            required
            defaultValue={product?.name}
            className={inputCls}
          />
        </Field>
        <Field label="SKU" name="sku" error={errors.sku}>
          <input
            id="sku"
            name="sku"
            required
            defaultValue={product?.sku}
            placeholder="ex: AUD-004"
            className={`${inputCls} font-mono uppercase`}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Categorie" name="category" error={errors.category}>
          <input
            id="category"
            name="category"
            required
            list="categories"
            defaultValue={product?.category}
            placeholder="alege sau scrie una noua"
            className={inputCls}
          />
          <datalist id="categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Brand (optional)" name="brand" error={errors.brand}>
          <input
            id="brand"
            name="brand"
            defaultValue={product?.brand ?? ""}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Pret de baza (lei)" name="price" error={errors.price}>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={product ? (product.basePriceCents / 100).toFixed(2) : ""}
            className={inputCls}
          />
        </Field>
        <Field label="Stoc" name="stock" error={errors.stock}>
          <input
            id="stock"
            name="stock"
            type="number"
            min="0"
            step="1"
            required
            defaultValue={product?.stock ?? 0}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Descriere" name="description" error={errors.description}>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={product?.description}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:bg-surface-raised"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="URL imagine (optional)" name="imageUrl" error={errors.imageUrl}>
          <input
            id="imageUrl"
            name="imageUrl"
            type="url"
            defaultValue={product?.imageUrls[0] ?? ""}
            placeholder="gol = imagine demo automata"
            className={inputCls}
          />
        </Field>
        <Field label="Etichete (separate prin virgula)" name="tags" error={errors.tags}>
          <input
            id="tags"
            name="tags"
            defaultValue={product?.tags.join(", ")}
            placeholder="ex: wireless, promo"
            className={inputCls}
          />
        </Field>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product?.active ?? true}
          className="size-4 accent-ink"
        />
        Vizibil in magazin
      </label>

      <div className="flex items-center gap-3 border-t border-line pt-5">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Se salveaza…" : product ? "Salveaza modificarile" : "Creeaza produsul"}
        </Button>
        <Link href="/admin/products" className="text-sm text-ink-muted hover:text-ink">
          Renunta
        </Link>
      </div>
    </form>
  );
}
