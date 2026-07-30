import "server-only";
import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CartWithItems } from "./cart";
import type { PriceView } from "./pricing";
import type { ShippingQuote } from "./shipping-quote";
import type { FraudAssessment } from "./fraud-risk";

/** Adresa, asa cum e completata la checkout. */
export interface OrderAddress {
  name: string;
  phone: string;
  country: string;
  city: string;
  street: string;
  postalCode: string;
}

/**
 * Numar de comanda lizibil, unic per magazin: RS-20260730-4F2A.
 * Se reincearca la coliziune (indexul unic [storeId, orderNumber] decide).
 */
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
  /** Pasul de verificare suplimentara, cand antifrauda a cerut CHALLENGE. */
  challenge?: { code: string; verified: boolean } | null;
}

/**
 * Creeaza comanda impreuna cu liniile ei si scade stocul, intr-o tranzactie.
 * Fiecare linie pastreaza pretul de baza, pretul final si regulile care l-au
 * produs — istoricul rămâne corect chiar daca produsul sau regulile se schimba.
 */
export async function createOrder(input: CreateOrderInput) {
  const { cart, prices, quote, assessment } = input;

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
    ]),
  ];

  const rulesetVersions: Record<string, number> = {};
  const pricingVersion = [...prices.values()].find(
    (v) => v.rulesetVersion !== null,
  )?.rulesetVersion;
  if (typeof pricingVersion === "number") rulesetVersions.PRICING = pricingVersion;
  if (quote.rulesetVersion !== null) rulesetVersions.SHIPPING = quote.rulesetVersion;
  if (assessment.rulesetVersion !== null) rulesetVersions.FRAUD = assessment.rulesetVersion;

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
    ...(input.challenge ? { challenge: input.challenge } : {}),
  };

  // Numarul de comanda se poate ciocni; reincercam de cateva ori.
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNumber = buildOrderNumber();
    try {
      return await prisma.$transaction(async (tx) => {
        // Stocul se scade condiționat: updateMany cu `gte` este atomic, deci
        // doua comenzi simultane nu pot trece amandoua peste stocul disponibil.
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
            placedAt: new Date(),
            items: { create: items },
          },
          select: { id: true, orderNumber: true, status: true },
        });

        // Cosul se goleste: comanda preia liniile.
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

/** Comanda unui client/vizitator, cu verificarea dreptului de acces. */
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

  // Comanda e vizibila proprietarului contului sau sesiunii care a plasat-o.
  const owns =
    (viewer.userId !== null && order.userId === viewer.userId) ||
    (viewer.sessionKey !== null && order.sessionKey === viewer.sessionKey);
  return owns ? order : null;
}
