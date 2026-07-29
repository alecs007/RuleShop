"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/utils/slug";

const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  sku: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Za-z0-9-]+$/, "SKU: doar litere, cifre și cratime")
    .transform((s) => s.toUpperCase()),
  category: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .transform((s) => s.toLowerCase()),
  brand: z.string().trim().max(60).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  /** Pretul vine din formular in lei (ex: "349.90") si se stocheaza in bani. */
  price: z.coerce.number().positive().max(10_000_000),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  imageUrl: z.union([z.url(), z.literal("")]).optional(),
  tags: z.string().max(300).optional().or(z.literal("")),
  active: z.coerce.boolean(),
});

export interface ProductFormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

function parseForm(formData: FormData) {
  return productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    category: formData.get("category"),
    brand: formData.get("brand") ?? "",
    description: formData.get("description") ?? "",
    price: formData.get("price"),
    stock: formData.get("stock"),
    imageUrl: (formData.get("imageUrl") as string) || "",
    tags: formData.get("tags") ?? "",
    active: formData.get("active") === "on",
  });
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function toData(values: z.infer<typeof productSchema>, storeId: string) {
  return {
    name: values.name,
    sku: values.sku,
    category: values.category,
    brand: values.brand || null,
    description: values.description ?? "",
    basePriceCents: Math.round(values.price * 100),
    stock: values.stock,
    imageUrls: values.imageUrl
      ? [values.imageUrl]
      : [`https://picsum.photos/seed/${storeId.slice(-4)}-${values.sku}/900/900`],
    tags: values.tags
      ? values.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [],
    active: values.active,
  };
}

export async function createProductAction(
  _prev: ProductFormState | undefined,
  formData: FormData,
): Promise<ProductFormState> {
  const { user, storeId } = await requireAdmin();

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, message: "Verifică erorile.", fieldErrors: fieldErrors(parsed.error) };
  }

  const data = toData(parsed.data, storeId);
  const slug = slugify(data.name);

  try {
    const product = await prisma.product.create({
      data: { ...data, slug, storeId },
    });
    await logAudit({
      storeId,
      action: "PRODUCT_CREATED",
      entityType: "Product",
      entityId: product.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      after: data,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "Există deja un produs cu acest SKU sau nume (slug)." };
    }
    throw error;
  }

  revalidatePath("/", "layout");
  redirect("/admin/products");
}

export async function updateProductAction(
  productId: string,
  _prev: ProductFormState | undefined,
  formData: FormData,
): Promise<ProductFormState> {
  const { user, storeId } = await requireAdmin();

  // Scoping pe storeId: un admin nu poate atinge produsele altui magazin.
  const existing = await prisma.product.findFirst({
    where: { id: productId, storeId },
  });
  if (!existing) return { ok: false, message: "Produsul nu există." };

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, message: "Verifică erorile.", fieldErrors: fieldErrors(parsed.error) };
  }

  const data = toData(parsed.data, storeId);

  try {
    await prisma.product.update({
      where: { id: existing.id },
      data, // slug-ul ramane stabil — URL-urile si SEO-ul nu se strica
    });
    await logAudit({
      storeId,
      action: "PRODUCT_UPDATED",
      entityType: "Product",
      entityId: existing.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      before: {
        name: existing.name,
        basePriceCents: existing.basePriceCents,
        stock: existing.stock,
        active: existing.active,
      },
      after: data,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "Există deja un produs cu acest SKU." };
    }
    throw error;
  }

  revalidatePath("/", "layout");
  redirect("/admin/products");
}

/** Dezactivare (soft delete) — comenzile si istoricul raman intacte. */
export async function toggleProductAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireAdmin();
  const productId = formData.get("productId");
  if (typeof productId !== "string") return;

  const existing = await prisma.product.findFirst({
    where: { id: productId, storeId },
  });
  if (!existing) return;

  await prisma.product.update({
    where: { id: existing.id },
    data: { active: !existing.active },
  });
  await logAudit({
    storeId,
    action: "PRODUCT_UPDATED",
    entityType: "Product",
    entityId: existing.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    before: { active: existing.active },
    after: { active: !existing.active },
  });
  revalidatePath("/", "layout");
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireAdmin();
  const productId = formData.get("productId");
  if (typeof productId !== "string") return;

  const existing = await prisma.product.findFirst({
    where: { id: productId, storeId },
  });
  if (!existing) return;

  await prisma.product.delete({ where: { id: existing.id } });
  await logAudit({
    storeId,
    action: "PRODUCT_DELETED",
    entityType: "Product",
    entityId: existing.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    before: { name: existing.name, sku: existing.sku },
  });
  revalidatePath("/", "layout");
}
