"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { storeSlugSchema } from "@/lib/shop/store-slug";
import {
  StoreAdminError,
  createStore,
  selectAdminStore,
  setDefaultStore,
  setStoreActive,
} from "@/lib/shop/store-admin";

export interface StoreActionState {
  ok: boolean;
  message?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: storeSlugSchema,
  // Coduri standard, ca sa nu ajunga in baza de date orice string.
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Moneda: cod ISO din 3 litere (ex: RON, EUR)."),
  locale: z
    .string()
    .trim()
    .regex(/^[a-z]{2}-[A-Z]{2}$/, "Limba: format ll-CC (ex: ro-RO, de-DE)."),
  makeDefault: z.coerce.boolean().default(false),
});

const storeIdSchema = z.object({ storeId: z.string().min(1) });

/** Traduce erorile de business in mesaj pentru formular; restul rămân in loguri. */
function failure(error: unknown, fallback: string): StoreActionState {
  if (error instanceof StoreAdminError) return { ok: false, message: error.message };
  console.error("[stores] operația a eșuat:", error);
  return { ok: false, message: fallback };
}

export async function createStoreAction(
  _prev: StoreActionState | undefined,
  formData: FormData,
): Promise<StoreActionState> {
  const { user } = await requirePlatformAdmin();

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    currency: formData.get("currency"),
    locale: formData.get("locale"),
    makeDefault: formData.get("makeDefault") === "on",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Date invalide." };
  }

  try {
    const store = await createStore(parsed.data);
    await logAudit({
      storeId: store.id,
      action: "STORE_CREATED",
      entityType: "Store",
      entityId: store.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      after: {
        slug: store.slug,
        name: store.name,
        currency: store.currency,
        locale: store.locale,
        isDefault: store.isDefault,
      },
    });

    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Magazinul „${store.name}” a fost creat, cu regulile de start publicate.`,
    };
  } catch (error) {
    return failure(error, "Magazinul nu a putut fi creat.");
  }
}

/**
 * Comuta panoul pe alt magazin. Nu schimba magazinul activ — clienții văd în
 * continuare același magazin.
 *
 * Comutarea e o preferință de panou, deci un eșec nu dărâmă pagina: panoul
 * rămâne pe magazinul curent și motivul ajunge în interfață, ca administratorul
 * să nu creadă că lucrează pe alt magazin decât o arată panoul.
 */
export async function selectStoreAction(
  formData: FormData,
): Promise<StoreActionState> {
  await requirePlatformAdmin();

  const parsed = storeIdSchema.safeParse({ storeId: formData.get("storeId") });
  if (!parsed.success) return { ok: false, message: "Cerere invalidă." };

  let store;
  try {
    store = await selectAdminStore(parsed.data.storeId);
  } catch (error) {
    return failure(error, "Comutarea pe alt magazin nu a reușit.");
  }

  revalidatePath("/", "layout");
  return { ok: true, message: `Administrezi „${store.name}”.` };
}

export async function setDefaultStoreAction(
  _prev: StoreActionState | undefined,
  formData: FormData,
): Promise<StoreActionState> {
  const { user } = await requirePlatformAdmin();

  const parsed = storeIdSchema.safeParse({ storeId: formData.get("storeId") });
  if (!parsed.success) return { ok: false, message: "Cerere invalidă." };

  try {
    const store = await setDefaultStore(parsed.data.storeId);
    await logAudit({
      storeId: store.id,
      action: "STORE_DEFAULT_CHANGED",
      entityType: "Store",
      entityId: store.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      after: { slug: store.slug, isDefault: true },
    });

    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `„${store.name}” este acum magazinul activ — clienții îl văd de acum.`,
    };
  } catch (error) {
    return failure(error, "Magazinul activ nu a putut fi schimbat.");
  }
}

export async function setStoreActiveAction(
  _prev: StoreActionState | undefined,
  formData: FormData,
): Promise<StoreActionState> {
  const { user } = await requirePlatformAdmin();

  const parsed = storeIdSchema
    .extend({ active: z.coerce.boolean() })
    .safeParse({
      storeId: formData.get("storeId"),
      active: formData.get("active") === "true",
    });
  if (!parsed.success) return { ok: false, message: "Cerere invalidă." };

  try {
    const store = await setStoreActive(parsed.data.storeId, parsed.data.active);
    await logAudit({
      storeId: store.id,
      action: store.active ? "STORE_ACTIVATED" : "STORE_DEACTIVATED",
      entityType: "Store",
      entityId: store.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      after: { slug: store.slug, active: store.active },
    });

    revalidatePath("/", "layout");
    return {
      ok: true,
      message: store.active
        ? `„${store.name}” a fost pornit.`
        : `„${store.name}” a fost oprit — nu mai poate fi servit clienților.`,
    };
  } catch (error) {
    return failure(error, "Starea magazinului nu a putut fi schimbată.");
  }
}
