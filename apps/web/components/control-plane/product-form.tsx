"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Product } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ImageDropzone } from "./image-dropzone";
import type { ProductFormState } from "@/app/(control-plane)/admin/products/actions";

type FormAction = (
  prev: ProductFormState | undefined,
  formData: FormData,
) => Promise<ProductFormState>;

function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1 text-xs text-critical">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent focus:bg-surface-raised";

/**
 * The product form. Existing categories are offered as suggestions; a new one
 * is created simply by typing it.
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
            placeholder="alege sau scrie una nouă"
            className={inputCls}
          />
          <datalist id="categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Brand (opțional)" name="brand" error={errors.brand}>
          <input
            id="brand"
            name="brand"
            defaultValue={product?.brand ?? ""}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Preț de bază (lei)" name="price" error={errors.price}>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={
              product ? (product.basePriceCents / 100).toFixed(2) : ""
            }
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
        {/* Weight feeds the `cart.weightGrams` fact used by shipping rules */}
        <Field
          label="Greutate (grame)"
          name="weightGrams"
          error={errors.weightGrams}
        >
          <input
            id="weightGrams"
            name="weightGrams"
            type="number"
            min="0"
            step="1"
            defaultValue={product?.weightGrams ?? 0}
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

      {/* A group, not a field: the label points at no single input */}
      <div>
        <p className="text-sm font-medium">Imagini</p>
        <div className="mt-1.5">
          <ImageDropzone name="imageUrls" initial={product?.imageUrls ?? []} />
        </div>
        {errors.imageUrls && (
          <p className="mt-1 text-xs text-critical">{errors.imageUrls}</p>
        )}
      </div>

      <Field
        label="Etichete (separate prin virgulă)"
        name="tags"
        error={errors.tags}
      >
        <input
          id="tags"
          name="tags"
          defaultValue={product?.tags.join(", ")}
          placeholder="ex: wireless, promo"
          className={inputCls}
        />
      </Field>

      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product?.active ?? true}
          className="size-4 accent-ink"
        />
        Vizibil în magazin
      </label>

      <div className="flex items-center gap-3 border-t border-line pt-5">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {pending
            ? "Se salvează…"
            : product
              ? "Salvează modificările"
              : "Creează produsul"}
        </Button>
        <Link
          href="/admin/products"
          className="text-sm text-ink-muted hover:text-ink"
        >
          Renunță
        </Link>
      </div>
    </form>
  );
}
