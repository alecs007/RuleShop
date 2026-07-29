"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveStore } from "@/lib/shop/store";
import { getOrCreateSessionKey } from "@/lib/shop/session";
import * as cartService from "@/lib/shop/cart";

const addSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
});

const quantitySchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(0).max(99),
});

export interface CartActionState {
  ok: boolean;
  message?: string;
}

export async function addToCartAction(
  _prev: CartActionState | undefined,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = addSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity") ?? 1,
  });
  if (!parsed.success) return { ok: false, message: "Cerere invalidă." };

  try {
    const store = await getActiveStore();
    const sessionKey = await getOrCreateSessionKey();
    await cartService.addItem(
      store.id,
      sessionKey,
      parsed.data.productId,
      parsed.data.quantity,
    );
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "A apărut o eroare.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Adăugat în coș." };
}

export async function setQuantityAction(formData: FormData): Promise<void> {
  const parsed = quantitySchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return;

  const store = await getActiveStore();
  const sessionKey = await getOrCreateSessionKey();
  await cartService.setItemQuantity(
    store.id,
    sessionKey,
    parsed.data.productId,
    parsed.data.quantity,
  );
  revalidatePath("/", "layout");
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const productId = formData.get("productId");
  if (typeof productId !== "string" || !productId) return;

  const store = await getActiveStore();
  const sessionKey = await getOrCreateSessionKey();
  await cartService.removeItem(store.id, sessionKey, productId);
  revalidatePath("/", "layout");
}
