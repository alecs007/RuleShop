"use server";

import { timingSafeEqual } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth/guards";
import { storeFromForm } from "@/lib/shop/store";
import { storeHref } from "@/lib/shop/routing";
import { getOrCreateSessionKey } from "@/lib/shop/session";
import { computeTotals, readCart } from "@/lib/shop/cart";
import {
  getAvailabilityViews,
  unavailableMessage,
} from "@/lib/shop/availability";
import { getEvaluationActor } from "@/lib/shop/context";
import { getPriceViews } from "@/lib/shop/pricing";
import { cartShippingFacts, quoteShipping } from "@/lib/shop/shipping";
import { getLoyaltyView } from "@/lib/shop/loyalty";
import {
  checkFraud,
  collectSessionSignals,
  readRequestFingerprint,
  recordFraudIncident,
} from "@/lib/shop/fraud";
import { createOrder, OutOfStockError, type OrderAddress } from "@/lib/shop/orders";
import { syncCustomerStats } from "@/lib/shop/customer-stats";
import { getPaymentProvider, isPaymentMethod } from "@/lib/shop/payment";
import type { OrderStatus, Prisma } from "@prisma/client";

const addressSchema = z.object({
  name: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(6).max(30),
  country: z
    .string()
    .trim()
    .length(2, "Codul țării are 2 litere (ex: RO)")
    .transform((s) => s.toUpperCase()),
  city: z.string().trim().min(2).max(80),
  street: z.string().trim().min(4).max(160),
  postalCode: z.string().trim().min(4).max(20),
});

const checkoutSchema = z.object({
  email: z.email("Adresă de email invalidă."),
  shipping: addressSchema,
  billingSameAsShipping: z.coerce.boolean(),
  billing: addressSchema.optional(),
  paymentMethod: z.string().refine(isPaymentMethod, "Metodă de plată invalidă."),
});

export interface CheckoutState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

function readAddress(formData: FormData, prefix: string) {
  return {
    name: formData.get(`${prefix}.name`),
    phone: formData.get(`${prefix}.phone`),
    country: formData.get(`${prefix}.country`),
    city: formData.get(`${prefix}.city`),
    street: formData.get(`${prefix}.street`),
    postalCode: formData.get(`${prefix}.postalCode`),
  };
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Simulated verification code for the CHALLENGE step. */
function challengeCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Places the order. Everything is recomputed on the server: the form only
 * carries the address, the email and the payment method, never amounts.
 *
 * The decisions run PRICING -> SHIPPING -> LOYALTY -> FRAUD, and the fraud
 * verdict decides what happens: ALLOW takes the payment, CHALLENGE parks the
 * order pending verification, REVIEW sends it to the control plane, and BLOCK
 * creates nothing at all, leaving stock untouched.
 */
export async function placeOrderAction(
  _prev: CheckoutState | undefined,
  formData: FormData,
): Promise<CheckoutState> {
  const billingSame = formData.get("billingSameAsShipping") === "on";
  const parsed = checkoutSchema.safeParse({
    email: formData.get("email"),
    shipping: readAddress(formData, "shipping"),
    billingSameAsShipping: billingSame,
    billing: billingSame ? undefined : readAddress(formData, "billing"),
    paymentMethod: formData.get("paymentMethod"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Verifică datele completate.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const store = await storeFromForm(formData);
  if (!store) return { ok: false, message: "Magazinul nu este disponibil." };
  const sessionKey = await getOrCreateSessionKey();

  // Rapid repeat submissions are either a UI bug or abuse; both stop here.
  const gate = await rateLimit("checkout", `${store.id}:${sessionKey}`);
  if (!gate.allowed) {
    return {
      ok: false,
      message: `Prea multe încercări — așteaptă ${gate.retryAfterSeconds}s și încearcă din nou.`,
    };
  }

  const cart = await readCart(store.id);
  if (!cart || cart.items.length === 0) {
    return { ok: false, message: "Coșul este gol." };
  }

  // AVAILABILITY is re-checked here: a rule published between adding to the
  // cart and checking out can block or cap a product.
  const availability = await getAvailabilityViews(
    cart.items.map((i) => i.product),
  );
  for (const item of cart.items) {
    const view = availability.get(item.productId)!;
    if (!view.available) {
      return {
        ok: false,
        message: `${unavailableMessage(view, item.product.name)} Scoate-l din coș pentru a continua.`,
      };
    }
    if (item.quantity > view.maxPerOrder) {
      return {
        ok: false,
        message: `Poți comanda maximum ${view.maxPerOrder} bucăți din „${item.product.name}". Ajustează coșul pentru a continua.`,
      };
    }
  }

  const viewer = await getSessionUser();
  const email = parsed.data.email.trim().toLowerCase();
  const shippingAddress = parsed.data.shipping as OrderAddress;
  const billingAddress = (parsed.data.billingSameAsShipping
    ? parsed.data.shipping
    : (parsed.data.billing ?? parsed.data.shipping)) as OrderAddress;

  // Price and shipping, recomputed on the server.
  const prices = await getPriceViews(
    cart.items.map((i) => i.product),
    { record: "checkout" },
  );
  const totals = computeTotals(cart, prices);
  const cartFacts = cartShippingFacts(cart, totals);
  const quote = await quoteShipping({
    storeId: store.id,
    storeSettings: store.settings,
    currency: totals.currency,
    cart: cartFacts,
    selectedMethodId: cart.shippingMethodId,
    record: "checkout",
  });
  if (!quote.selected) {
    return {
      ok: false,
      message: "Nu există nicio metodă de livrare disponibilă pentru acest coș.",
    };
  }

  const shippingCents = quote.selected.costCents;
  const discountCents = cart.items.reduce((sum, item) => {
    const view = prices.get(item.productId);
    const unitDiscount = view
      ? Math.max(0, view.baseCents - view.finalCents)
      : 0;
    return sum + unitDiscount * item.quantity;
  }, 0);
  const totalCents = totals.subtotalCents + shippingCents;

  // LOYALTY is evaluated before createOrder, against the customer facts from
  // before this order, and frozen onto it; the balance is recomputed after.
  const loyalty = await getLoyaltyView({
    storeId: store.id,
    cart: cartFacts,
    order: {
      totalCents,
      shippingCents,
      paymentMethod: parsed.data.paymentMethod,
    },
    record: "checkout",
  });

  // The fraud check.
  const fingerprint = await readRequestFingerprint();
  const actor = await getEvaluationActor();
  const sessionFacts = await collectSessionSignals(
    { storeId: store.id, sessionKey, userId: viewer?.id ?? null, email },
    fingerprint,
    Boolean(viewer),
  );
  const orderFacts = {
    totalCents,
    shippingCents,
    shippingCountry: shippingAddress.country,
    billingCountry: billingAddress.country,
    addressMismatch:
      shippingAddress.country !== billingAddress.country ||
      shippingAddress.city.toLowerCase() !== billingAddress.city.toLowerCase(),
    paymentMethod: parsed.data.paymentMethod,
    itemCount: totals.itemCount,
  };

  const assessment = await checkFraud({
    storeId: store.id,
    cart: cartFacts,
    customer: {
      ...actor.customer,
      email,
      emailDomain: email.split("@")[1] ?? "",
    },
    session: sessionFacts,
    order: orderFacts,
  });

  const recordIncident = (orderId: string | null) =>
    recordFraudIncident({
      storeId: store.id,
      orderId,
      userId: viewer?.id ?? null,
      sessionKey,
      email,
      fingerprint,
      assessment,
      session: sessionFacts,
      order: orderFacts,
    });

  // BLOCK: no order is created.
  if (assessment.decision === "BLOCK") {
    await recordIncident(null);
    await logAudit({
      storeId: store.id,
      action: "ORDER_BLOCKED",
      entityType: "FraudIncident",
      actorId: viewer?.id ?? null,
      actorEmail: email,
      metadata: {
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        matchedRules: assessment.matchedRules,
        signals: assessment.flaggedSignals,
      },
      traceId: assessment.traceId,
    });
    return {
      ok: false,
      message:
        "Comanda nu a putut fi finalizată din motive de securitate. Te rugăm să contactezi suportul.",
    };
  }

  // Payment, only for orders that pass straight through.
  const provider = getPaymentProvider();
  let paymentRef: string | null = null;
  let status: OrderStatus;
  const challenge =
    assessment.decision === "CHALLENGE"
      ? { code: challengeCode(), verified: false }
      : null;

  if (assessment.decision === "ALLOW") {
    const payment = await provider.authorize({
      orderNumber: "pending",
      amountCents: totalCents,
      currency: totals.currency,
      method: parsed.data.paymentMethod,
    });
    if (!payment.ok) {
      return { ok: false, message: payment.message ?? "Plata a fost refuzată." };
    }
    paymentRef = payment.reference;
    status = payment.deferred ? "PENDING" : "PAID";
  } else if (assessment.decision === "CHALLENGE") {
    status = "PENDING";
  } else {
    status = "AWAITING_REVIEW";
  }

  let order;
  try {
    order = await createOrder({
      storeId: store.id,
      cart,
      prices,
      quote,
      assessment,
      loyalty,
      status,
      sessionKey,
      userId: viewer?.id ?? null,
      guestEmail: viewer ? null : email,
      guestName: viewer ? null : shippingAddress.name,
      shippingAddress,
      billingAddress,
      paymentMethod: parsed.data.paymentMethod,
      paymentRef,
      subtotalCents: totals.subtotalCents,
      discountCents,
      shippingCents,
      totalCents,
      currency: totals.currency,
      challenge,
    });
  } catch (error) {
    if (error instanceof OutOfStockError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  // The customer facts the rules read are resynced at once, so the next
  // evaluation sees reality. Points only count once the order is paid.
  await syncCustomerStats(store.id, viewer?.id ?? null);

  await recordIncident(order.id);
  if (assessment.decision !== "ALLOW") {
    await logAudit({
      storeId: store.id,
      action: "ORDER_STATUS_CHANGED",
      entityType: "Order",
      entityId: order.id,
      actorId: viewer?.id ?? null,
      actorEmail: email,
      after: { status, decision: assessment.decision },
      metadata: {
        riskScore: assessment.riskScore,
        matchedRules: assessment.matchedRules,
      },
      traceId: assessment.traceId,
    });
  }

  revalidatePath("/", "layout");
  redirect(storeHref(store.pathPrefix, `/orders/${order.orderNumber}`));
}

/**
 * The CHALLENGE step. In this demo the code is shown on the page; a real
 * system would send it by email or SMS.
 */
export async function verifyChallengeAction(
  _prev: CheckoutState | undefined,
  formData: FormData,
): Promise<CheckoutState> {
  const orderNumber = String(formData.get("orderNumber") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  const store = await storeFromForm(formData);
  if (!store) return { ok: false, message: "Magazinul nu este disponibil." };
  const sessionKey = await getOrCreateSessionKey();
  const viewer = await getSessionUser();

  // The code is 6 digits: without a limit it could be guessed.
  const gate = await rateLimit("orderChallenge", `${store.id}:${orderNumber}`);
  if (!gate.allowed) {
    return {
      ok: false,
      message: "Prea multe încercări greșite — reîncearcă peste câteva minute.",
    };
  }

  const order = await prisma.order.findUnique({
    where: { storeId_orderNumber: { storeId: store.id, orderNumber } },
  });
  if (
    !order ||
    (order.sessionKey !== sessionKey && order.userId !== (viewer?.id ?? null))
  ) {
    return { ok: false, message: "Comanda nu a fost găsită." };
  }

  const snapshot = (order.decisionSnapshot ?? {}) as Record<string, unknown>;
  const challenge = snapshot.challenge as
    | { code?: string; verified?: boolean }
    | undefined;
  if (!challenge?.code || challenge.verified) {
    return { ok: false, message: "Această comandă nu așteaptă verificare." };
  }
  // Constant time, so the response does not leak how much was correct.
  const expected = Buffer.from(challenge.code);
  const provided = Buffer.from(code);
  const codeMatches =
    expected.length === provided.length && timingSafeEqual(expected, provided);
  if (!codeMatches) {
    return { ok: false, message: "Codul introdus nu este corect." };
  }

  const provider = getPaymentProvider();
  const payment = await provider.authorize({
    orderNumber: order.orderNumber,
    amountCents: order.totalCents,
    currency: order.currency,
    method: (order.paymentMethod ?? "card") as "card" | "ramburs" | "card-refuzat",
  });
  if (!payment.ok) {
    return { ok: false, message: payment.message ?? "Plata a fost refuzată." };
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: payment.deferred ? "PENDING" : "PAID",
      paymentRef: payment.reference,
      decisionSnapshot: {
        ...snapshot,
        challenge: { ...challenge, verified: true },
      } as Prisma.InputJsonValue,
    },
  });
  await syncCustomerStats(store.id, order.userId);
  await logAudit({
    storeId: store.id,
    action: "ORDER_STATUS_CHANGED",
    entityType: "Order",
    entityId: order.id,
    actorEmail: order.guestEmail,
    before: { status: order.status },
    after: { status: payment.deferred ? "PENDING" : "PAID", challenge: "verified" },
  });

  revalidatePath(storeHref(store.pathPrefix, `/orders/${order.orderNumber}`));
  return { ok: true, message: "Comandă confirmată." };
}
