import "server-only";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth";
import { getSessionKey } from "./session";

export type CartWithItems = NonNullable<Awaited<ReturnType<typeof readCart>>>;

/** Cosul curent (sau null daca nu exista inca), cu produsele incluse. */
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

/** Numarul de bucati din cos — pentru badge-ul din header. */
export async function getCartCount(storeId: string): Promise<number> {
  const cart = await readCart(storeId);
  if (!cart) return 0;
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Cosul de scris (creat la nevoie). Presupune ca sessionKey exista deja —
 * server action-urile il creeaza cu getOrCreateSessionKey().
 */
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
    // storeId in filtru: un produs din alt magazin nu poate ajunge in cos.
    where: { id: productId, storeId, active: true },
  });
  if (!product) throw new Error("Produsul nu există în acest magazin.");

  const cart = await getOrCreateCart(storeId, sessionKey);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
  });

  const desired = (existing?.quantity ?? 0) + quantity;
  // TODO(rules): plafonul per comanda va veni din decizia AVAILABILITY
  // (LIMIT_QUANTITY); pana atunci limitam la stocul disponibil.
  const capped = Math.min(desired, Math.max(0, product.stock));
  if (capped <= 0) throw new Error("Produsul nu mai este în stoc.");

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

  await prisma.cartItem.update({
    where: { cartId_productId: { cartId: cart.id, productId } },
    data: { quantity: Math.min(quantity, Math.max(1, product.stock)) },
  });
}

/**
 * Salveaza metoda de livrare preferata. Nu se valideaza aici daca metoda e
 * disponibila: disponibilitatea o decide rulesetul SHIPPING la fiecare
 * afisare, deci verificarea are loc in cotatie (`computeShippingQuote`).
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
 * Totalurile cosului. `prices` — deciziile PRICING per produs; fara ele se
 * folosesc preturile de baza. Costul livrarii (SHIPPING) se adauga la checkout.
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
    const unit = prices?.get(item.productId)?.finalCents ?? item.product.basePriceCents;
    itemCount += item.quantity;
    subtotalCents += item.quantity * unit;
  }
  return {
    itemCount,
    subtotalCents,
    currency: cart.items[0]?.product.currency ?? "RON",
  };
}
