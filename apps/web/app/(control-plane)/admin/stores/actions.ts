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
  setMainStore,
  setStoreActive,
} from "@/lib/shop/store-admin";

export interface StoreActionState {
  ok: boolean;
  message?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: storeSlugSchema,
  // Standard codes, so not any string reaches the database.
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Moneda: cod ISO din 3 litere (ex: RON, EUR)."),
  locale: z
    .string()
    .trim()
    .regex(/^[a-z]{2}-[A-Z]{2}$/, "Limba: format ll-CC (ex: ro-RO, de-DE)."),
  /** `de` -> /de. Empty means the main store; uniqueness is checked in `createStore`. */
  pathPrefix: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{0,30}$/, "Prefixul: litere mici, cifre și cratime.")
    .nullable(),
});

const storeIdSchema = z.object({ storeId: z.string().min(1) });

/** Turns business errors into form messages; the rest stay in the logs. */
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
    pathPrefix: (formData.get("pathPrefix") as string | null)?.trim() || null,
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
        pathPrefix: store.pathPrefix,
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
 * Switches the panel to another store. The active store is untouched, so
 * customers still see the same one.
 *
 * This is a panel preference, so a failure does not break the page: the panel
 * stays put and says why, rather than letting an admin believe they are
 * working somewhere they are not.
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

export async function setMainStoreAction(
  _prev: StoreActionState | undefined,
  formData: FormData,
): Promise<StoreActionState> {
  const { user } = await requirePlatformAdmin();

  const parsed = storeIdSchema.safeParse({ storeId: formData.get("storeId") });
  if (!parsed.success) return { ok: false, message: "Cerere invalidă." };

  try {
    const store = await setMainStore(parsed.data.storeId);
    await logAudit({
      storeId: store.id,
      action: "STORE_DEFAULT_CHANGED",
      entityType: "Store",
      entityId: store.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      after: { slug: store.slug, pathPrefix: null },
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
