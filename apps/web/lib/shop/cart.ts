import "server-only";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth";
import { getSessionKey } from "./session";
import {
  clampQuantity,
  getAvailabilityView,
  unavailableMessage,
} from "./availability";

export type CartWithItems = NonNullable<Awaited<ReturnType<typeof readCart>>>;

export class CartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartError";
  }
}

/** The current cart, with its products; null if there is none yet. */
export async function readCart(storeId: string) {
  const sessionKey = await getSessionKey();
  if (!sessionKey) return null;

  return prisma.cart.findUnique({
    where: { storeId_sessionKey: { storeId, sessionKey } },
    include: {
      items: {
        include: { product: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

/** Item count, for the header badge. */
export async function getCartCount(storeId: string): Promise<number> {
  const cart = await readCart(storeId);
  if (!cart) return 0;
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Assumes the sessionKey exists: server actions create it beforehand. */
export async function getOrCreateCart(storeId: string, sessionKey: string) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const cart = await prisma.cart.upsert({
    where: { storeId_sessionKey: { storeId, sessionKey } },
    create: { storeId, sessionKey, userId },
    update: userId ? { userId } : {},
  });
  return cart;
}

export async function addItem(
  storeId: string,
  sessionKey: string,
  productId: string,
  quantity: number,
) {
  const product = await prisma.product.findFirst({
    // `storeId` in the filter: no product from another store can get in.
    where: { id: productId, storeId, active: true },
  });
  if (!product) throw new CartError("Produsul nu există în acest magazin.");

  // A hidden or unavailable product never enters the cart, and the per-order
  // cap trims the quantity, not just the stock.
  const view = await getAvailabilityView(product);
  if (!view.available)
    throw new CartError(unavailableMessage(view, product.name));

  const cart = await getOrCreateCart(storeId, sessionKey);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
  });

  const desired = (existing?.quantity ?? 0) + quantity;
  const { quantity: capped, limitedBy } = clampQuantity(view, desired);
  if (capped <= 0) throw new CartError(unavailableMessage(view, product.name));
  if (existing && capped <= existing.quantity) {
    // The cap was already reached; a no-op "success" would confuse.
    throw new CartError(
      limitedBy === "rule"
        ? `Poți comanda maximum ${view.maxPerOrder} bucăți din „${product.name}".`
        : `Stocul nu permite mai mult de ${view.maxPerOrder} bucăți din „${product.name}".`,
    );
  }

  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    create: { cartId: cart.id, productId, quantity: capped },
    update: { quantity: capped },
  });
}

export async function setItemQuantity(
  storeId: string,
  sessionKey: string,
  productId: string,
  quantity: number,
) {
  const cart = await prisma.cart.findUnique({
    where: { storeId_sessionKey: { storeId, sessionKey } },
  });
  if (!cart) return;

  if (quantity <= 0) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    return;
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, storeId, active: true },
  });
  if (!product) return;

  // If the product became unavailable meanwhile the line is left alone: the
  // customer sees it flagged in the cart and can remove it.
  const view = await getAvailabilityView(product);
  const { quantity: capped } = clampQuantity(view, quantity);
  if (capped <= 0) return;

  await prisma.cartItem.update({
    where: { cartId_productId: { cartId: cart.id, productId } },
    data: { quantity: capped },
  });
}

/**
 * Availability is not checked here: the SHIPPING ruleset decides it on every
 * render, so `computeShippingQuote` is where it belongs.
 */
export async function setShippingMethod(
  storeId: string,
  sessionKey: string,
  methodId: string,
) {
  await prisma.cart.updateMany({
    where: { storeId, sessionKey },
    data: { shippingMethodId: methodId },
  });
}

export async function removeItem(
  storeId: string,
  sessionKey: string,
  productId: string,
) {
  const cart = await prisma.cart.findUnique({
    where: { storeId_sessionKey: { storeId, sessionKey } },
  });
  if (!cart) return;
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
}

export interface CartTotals {
  itemCount: number;
  subtotalCents: number;
  currency: string;
}

/**
 * Cart totals. Without `prices` (the per-product PRICING decisions) the base
 * prices are used. Shipping is added at checkout.
 */
export function computeTotals(
  cart: CartWithItems | null,
  prices?: Map<string, { finalCents: number }>,
): CartTotals {
  if (!cart || cart.items.length === 0) {
    return { itemCount: 0, subtotalCents: 0, currency: "RON" };
  }
  let itemCount = 0;
  let subtotalCents = 0;
  for (const item of cart.items) {
    const unit =
      prices?.get(item.productId)?.finalCents ?? item.product.basePriceCents;
    itemCount += item.quantity;
    subtotalCents += item.quantity * unit;
  }
  return {
    itemCount,
    subtotalCents,
    currency: cart.items[0]?.product.currency ?? "RON",
  };
}
