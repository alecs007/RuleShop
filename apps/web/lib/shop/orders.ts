import "server-only";
import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CartWithItems } from "./cart";
import type { PriceView } from "./pricing";
import type { ShippingQuote } from "@ruleshop/storefront";
import type { FraudAssessment } from "@ruleshop/storefront";
import type { LoyaltyView } from "@ruleshop/storefront";

/** The address as filled in at checkout. */
export interface OrderAddress {
  name: string;
  phone: string;
  country: string;
  city: string;
  street: string;
  postalCode: string;
}

/** Readable, unique per store: RS-20260730-4F2A. Retried on collision. */
function buildOrderNumber(): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RS-${day}-${suffix}`;
}

export interface CreateOrderInput {
  storeId: string;
  cart: CartWithItems;
  prices: Map<string, PriceView>;
  quote: ShippingQuote;
  assessment: FraudAssessment;
  /** The LOYALTY decision for this order. */
  loyalty: LoyaltyView;
  status: OrderStatus;
  sessionKey: string;
  userId: string | null;
  guestEmail: string | null;
  guestName: string | null;
  shippingAddress: OrderAddress;
  billingAddress: OrderAddress;
  paymentMethod: string;
  paymentRef: string | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  /** The extra verification step, when fraud asked for a CHALLENGE. */
  challenge?: { code: string; verified: boolean } | null;
}

/**
 * Creates the order with its lines and decrements stock, in one transaction.
 * Each line keeps the base price, the final price and the rules behind it, so
 * history stays accurate when the product or the rules change.
 */
export async function createOrder(input: CreateOrderInput) {
  const { cart, prices, quote, assessment, loyalty } = input;

  const items = cart.items.map((item) => {
    const view = prices.get(item.productId);
    const finalPrice = view?.finalCents ?? item.product.basePriceCents;
    return {
      productId: item.productId,
      sku: item.product.sku,
      name: item.product.name,
      quantity: item.quantity,
      basePriceCents: item.product.basePriceCents,
      finalPriceCents: finalPrice,
      discountCents: Math.max(0, item.product.basePriceCents - finalPrice) * item.quantity,
      lineTotalCents: finalPrice * item.quantity,
      appliedRules: (view?.matchedRules ?? []) as Prisma.InputJsonValue,
    };
  });

  const matchedRuleKeys = [
    ...new Set([
      ...items.flatMap((i) => (i.appliedRules as string[]) ?? []),
      ...quote.options.flatMap((o) => o.matchedRules),
      ...assessment.matchedRules,
      ...loyalty.matchedRules,
    ]),
  ];

  const rulesetVersions: Record<string, number> = {};
  const pricingVersion = [...prices.values()].find(
    (v) => v.rulesetVersion !== null,
  )?.rulesetVersion;
  if (typeof pricingVersion === "number") rulesetVersions.PRICING = pricingVersion;
  if (quote.rulesetVersion !== null) rulesetVersions.SHIPPING = quote.rulesetVersion;
  if (assessment.rulesetVersion !== null) rulesetVersions.FRAUD = assessment.rulesetVersion;
  if (loyalty.rulesetVersion !== null) rulesetVersions.LOYALTY = loyalty.rulesetVersion;

  // Guests have no account to accrue on, so 0 is stored; the computation
  // itself stays in decisionSnapshot.
  const loyaltyPointsEarned = loyalty.creditable ? loyalty.points : 0;

  const decisionSnapshot = {
    pricing: Object.fromEntries(
      [...prices.entries()].map(([productId, view]) => [
        productId,
        {
          baseCents: view.baseCents,
          finalCents: view.finalCents,
          discountPercent: view.discountPercent,
          matchedRules: view.matchedRules,
        },
      ]),
    ),
    shipping: {
      methodId: quote.selected?.id ?? null,
      label: quote.selected?.label ?? null,
      costCents: quote.selected?.costCents ?? 0,
      baseCostCents: quote.selected?.baseCostCents ?? 0,
      matchedRules: quote.selected?.matchedRules ?? [],
      forcedMethodId: quote.forcedMethodId,
    },
    fraud: {
      decision: assessment.decision,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      decisionSource: assessment.decisionSource,
      flaggedSignals: assessment.flaggedSignals,
      matchedRules: assessment.matchedRules,
      thresholds: assessment.thresholds,
    },
    loyalty: {
      basePoints: loyalty.basePoints,
      pointsMultiplier: loyalty.pointsMultiplier,
      bonusPoints: loyalty.bonusPoints,
      points: loyalty.points,
      pointsCredited: loyaltyPointsEarned,
      benefits: loyalty.benefits,
      tier: loyalty.tier,
      matchedRules: loyalty.matchedRules,
    },
    ...(input.challenge ? { challenge: input.challenge } : {}),
  };

  // Order numbers can collide; retry a few times.
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNumber = buildOrderNumber();
    try {
      return await prisma.$transaction(async (tx) => {
        // `updateMany` with a `gte` guard is atomic, so two concurrent
        // orders cannot both draw past the available stock.
        for (const item of cart.items) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              storeId: input.storeId,
              stock: { gte: item.quantity },
            },
            data: { stock: { decrement: item.quantity } },
          });
          if (updated.count !== 1) {
            throw new OutOfStockError(item.product.name);
          }
        }

        const order = await tx.order.create({
          data: {
            storeId: input.storeId,
            orderNumber,
            userId: input.userId,
            guestEmail: input.guestEmail,
            guestName: input.guestName,
            sessionKey: input.sessionKey,
            status: input.status,
            subtotalCents: input.subtotalCents,
            discountCents: input.discountCents,
            shippingCents: input.shippingCents,
            totalCents: input.totalCents,
            currency: input.currency,
            shippingMethod: quote.selected?.id ?? null,
            shippingAddress: input.shippingAddress as unknown as Prisma.InputJsonValue,
            billingAddress: input.billingAddress as unknown as Prisma.InputJsonValue,
            paymentMethod: input.paymentMethod,
            paymentRef: input.paymentRef,
            decisionSnapshot: decisionSnapshot as unknown as Prisma.InputJsonValue,
            matchedRuleKeys,
            rulesetVersions: rulesetVersions as Prisma.InputJsonValue,
            traceId: assessment.traceId,
            riskScore: assessment.riskScore,
            // Points live on the order, not the account: the balance is the
            // sum over paid orders, so a cancelled one withdraws its own.
            loyaltyPointsEarned,
            placedAt: new Date(),
            items: { create: items },
          },
          select: { id: true, orderNumber: true, status: true },
        });

        // The cart is emptied: the order takes over its lines.
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

        return order;
      });
    } catch (error) {
      const duplicate =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (!duplicate) throw error;
    }
  }
  throw new Error("Nu s-a putut genera un număr de comandă unic.");
}

export class OutOfStockError extends Error {
  constructor(productName: string) {
    super(`„${productName}" nu mai este disponibil în cantitatea cerută.`);
    this.name = "OutOfStockError";
  }
}

export interface OrderViewer {
  userId: string | null;
  sessionKey: string | null;
}

/**
 * The orders the current visitor may track: their account's, plus those placed
 * from this browser session — which is what makes guest tracking work, and
 * what keeps an order visible after the buyer creates an account.
 *
 * Matching is on the httpOnly session cookie, never on the email: typing
 * someone else's address at checkout grants nothing.
 */
export async function listOrdersForViewer(
  storeId: string,
  viewer: OrderViewer,
) {
  const identities: Prisma.OrderWhereInput[] = [
    ...(viewer.userId ? [{ userId: viewer.userId }] : []),
    ...(viewer.sessionKey ? [{ sessionKey: viewer.sessionKey }] : []),
  ];
  if (identities.length === 0) return [];

  return prisma.order.findMany({
    where: { storeId, OR: identities },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { items: { select: { id: true, quantity: true, name: true } } },
  });
}

/** A single order, with the access check. */
export async function findOrderForViewer(
  storeId: string,
  orderNumber: string,
  viewer: { userId: string | null; sessionKey: string | null },
) {
  const order = await prisma.order.findUnique({
    where: { storeId_orderNumber: { storeId, orderNumber } },
    include: { items: true },
  });
  if (!order) return null;

  // Visible to the owning account, or to the session that placed it.
  const owns =
    (viewer.userId !== null && order.userId === viewer.userId) ||
    (viewer.sessionKey !== null && order.sessionKey === viewer.sessionKey);
  return owns ? order : null;
}
