/**
 * Demo activity: customers, orders, fraud incidents and evaluation history.
 * Without them the panel starts empty, and neither the AI analysis nor the
 * candidate-version simulation has anything to run on.
 *
 * Deterministic throughout: the same seed produces the same data, and the keys
 * are stable, so re-running updates rather than duplicates.
 */
import type { Prisma, PrismaClient, Product, Store } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** A deterministic generator: same seed, same activity. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(random: () => number, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)]!;

const daysAgo = (days: number, hour = 12): Date => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
};

export interface SeedCustomer {
  email: string;
  name: string;
  loyaltyTier: "STANDARD" | "SILVER" | "GOLD" | "VIP";
  country: string;
  /** How many paid orders they get in their history. */
  paidOrders: number;
}

/** The statuses that do not count as a purchase. */
const OPEN_STATUSES = ["PENDING", "PENDING", "AWAITING_REVIEW", "CANCELLED"] as const;

/**
 * Mirrors what the LOYALTY ruleset does, so the demo profiles do not look
 * filled in at random.
 */
const TIER_MULTIPLIER: Record<SeedCustomer["loyaltyTier"], number> = {
  STANDARD: 1,
  SILVER: 1.2,
  GOLD: 1.5,
  VIP: 2,
};

function loyaltyPointsFor(totalCents: number, tier: SeedCustomer["loyaltyTier"]): number {
  return Math.round((totalCents / 1000) * TIER_MULTIPLIER[tier]);
}

interface SeedActivityInput {
  db: Db;
  store: Store;
  products: Product[];
  customers: SeedCustomer[];
  /** The store's shipping methods, for `shippingMethod`. */
  shippingMethodIds: string[];
  /** How many orders are generated, guest ones included. */
  orderCount: number;
  /** The generator's seed, different per store. */
  randomSeed: number;
}

export interface SeedActivityResult {
  customers: number;
  orders: number;
  incidents: number;
  events: number;
}

export async function seedActivity({
  db,
  store,
  products,
  customers,
  shippingMethodIds,
  orderCount,
  randomSeed,
}: SeedActivityInput): Promise<SeedActivityResult> {
  if (products.length === 0) {
    return { customers: 0, orders: 0, incidents: 0, events: 0 };
  }

  const random = rng(randomSeed);

  const userIds = new Map<string, string>();
  for (const customer of customers) {
    const attributes = { country: customer.country, segment: "demo" };
    const user = await db.user.upsert({
      where: { email: customer.email },
      create: {
        storeId: store.id,
        email: customer.email,
        name: customer.name,
        role: "CUSTOMER",
        loyaltyTier: customer.loyaltyTier,
        attributes,
      },
      update: {
        storeId: store.id,
        name: customer.name,
        loyaltyTier: customer.loyaltyTier,
        attributes,
      },
      select: { id: true },
    });
    userIds.set(customer.email, user.id);
  }

  // Orders are planned up front rather than improvised in the loop: each
  // customer gets exactly as many paid orders as their profile says, or a VIP
  // could end up with nothing spent, contradicting their tier.
  interface OrderPlan {
    customer: SeedCustomer | null;
    status: (typeof OPEN_STATUSES)[number] | "PAID" | "FULFILLED";
  }

  const plan: OrderPlan[] = [];
  for (const customer of customers) {
    for (let i = 0; i < customer.paidOrders; i++) {
      plan.push({ customer, status: i % 3 === 0 ? "PAID" : "FULFILLED" });
    }
  }
  // The rest: orders in flight, cancelled ones and guest purchases, which the
  // rules see as `session.isGuest`.
  for (let i = plan.length; i < orderCount; i++) {
    plan.push({
      customer: i % 2 === 0 || !customers.length ? null : pick(random, customers),
      status: pick(random, OPEN_STATUSES),
    });
  }
  // Deterministic shuffle, so the orders do not come out grouped by customer.
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [plan[i], plan[j]] = [plan[j]!, plan[i]!];
  }

  // Fixed numbers, so re-seeding updates the same orders.
  const prefix = store.slug.toUpperCase().includes("DE") ? "DE" : "RS";

  // If `orderCount` shrinks between runs, the orders past the new bound would
  // be orphaned, so they are removed first.
  const keep = new Set(
    plan.map((_, i) => `${prefix}-DEMO-${String(i + 1).padStart(4, "0")}`),
  );
  const stale = await db.order.findMany({
    where: { storeId: store.id, orderNumber: { startsWith: `${prefix}-DEMO-` } },
    select: { id: true, orderNumber: true },
  });
  const staleIds = stale.filter((o) => !keep.has(o.orderNumber)).map((o) => o.id);
  if (staleIds.length) {
    await db.orderItem.deleteMany({ where: { orderId: { in: staleIds } } });
    await db.order.deleteMany({ where: { id: { in: staleIds } } });
  }

  let orders = 0;

  for (const [i, entry] of plan.entries()) {
    const orderNumber = `${prefix}-DEMO-${String(i + 1).padStart(4, "0")}`;

    const customer = entry.customer;
    const asGuest = customer === null;
    const userId = customer ? userIds.get(customer.email)! : null;
    const status = entry.status;
    const placedAt = daysAgo(Math.floor(random() * 60) + 1, 9 + Math.floor(random() * 9));

    // One to three lines, all distinct products.
    const lineCount = 1 + Math.floor(random() * 3);
    const chosen: Product[] = [];
    for (let l = 0; l < lineCount; l++) {
      const candidate = pick(random, products);
      if (!chosen.some((p) => p.id === candidate.id)) chosen.push(candidate);
    }

    const isVip = customer?.loyaltyTier === "VIP";
    const isGold = customer?.loyaltyTier === "GOLD";
    const percentOff = isVip ? 15 : isGold ? 10 : 0;
    const matchedRuleKeys = percentOff ? [isVip ? "vip-discount" : "gold-discount"] : [];

    const items = chosen.map((product) => {
      const quantity = 1 + Math.floor(random() * 2);
      const base = product.basePriceCents;
      const final = Math.round(base * (1 - percentOff / 100));
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity,
        basePriceCents: base,
        finalPriceCents: final,
        discountCents: (base - final) * quantity,
        lineTotalCents: final * quantity,
        appliedRules: (percentOff
          ? [{ key: matchedRuleKeys[0], percent: percentOff }]
          : []) as Prisma.InputJsonValue,
      };
    });

    const subtotalCents = items.reduce((sum, item) => sum + item.basePriceCents * item.quantity, 0);
    const discountCents = items.reduce((sum, item) => sum + item.discountCents, 0);
    const goodsCents = subtotalCents - discountCents;
    // Free shipping over a threshold, as the SHIPPING ruleset does.
    const freeShipping = goodsCents >= 30000;
    const shippingCents = freeShipping ? 0 : 1999;
    const totalCents = goodsCents + shippingCents;

    const riskScore = Math.floor(random() * 100);
    const email = asGuest
      ? `oaspete${i + 1}@example.com`
      : (customer?.email ?? `client${i + 1}@example.com`);

    const address = {
      name: asGuest ? `Oaspete ${i + 1}` : (customer?.name ?? "Client"),
      country: customer?.country ?? "RO",
      city: pick(random, ["București", "Cluj-Napoca", "Iași", "Timișoara", "Brașov"]),
      street: `Strada Exemplu ${1 + Math.floor(random() * 90)}`,
      postalCode: String(100000 + Math.floor(random() * 800000)),
    };

    const decisionSnapshot = {
      pricing: { subtotalCents, discountCents, percentOff },
      shipping: { freeShipping, costCents: shippingCents },
      fraud: { riskScore },
    };

    const existing = await db.order.findUnique({
      where: { storeId_orderNumber: { storeId: store.id, orderNumber } },
      select: { id: true },
    });

    const common = {
      userId,
      guestEmail: asGuest ? email : null,
      guestName: asGuest ? address.name : null,
      sessionKey: `seed-${store.slug}-${i + 1}`,
      status,
      subtotalCents,
      discountCents,
      shippingCents,
      totalCents,
      currency: store.currency,
      shippingMethod: shippingMethodIds.length ? pick(random, shippingMethodIds) : null,
      shippingAddress: address as Prisma.InputJsonValue,
      billingAddress: address as Prisma.InputJsonValue,
      paymentMethod: "card",
      paymentRef: `sim_${orderNumber.toLowerCase()}`,
      decisionSnapshot: decisionSnapshot as Prisma.InputJsonValue,
      matchedRuleKeys,
      rulesetVersions: { PRICING: 1, SHIPPING: 1, FRAUD: 1, LOYALTY: 1 } as Prisma.InputJsonValue,
      traceId: `seed-${orderNumber.toLowerCase()}`,
      loyaltyPointsEarned: loyaltyPointsFor(totalCents, customer?.loyaltyTier ?? "STANDARD"),
      riskScore,
      placedAt,
      createdAt: placedAt,
    };

    if (existing) {
      await db.order.update({ where: { id: existing.id }, data: common });
      // Lines are rewritten so their prices track the catalog.
      await db.orderItem.deleteMany({ where: { orderId: existing.id } });
      await db.orderItem.createMany({
        data: items.map((item) => ({ ...item, orderId: existing.id })),
      });
    } else {
      await db.order.create({
        data: {
          storeId: store.id,
          orderNumber,
          ...common,
          items: { create: items },
        },
      });
    }
    orders++;
  }

  // Derived from the orders rather than written by hand, on the same rule as
  // `lib/shop/customer-stats.ts`. It is repeated here because that module is
  // `server-only` and cannot be imported from a script.
  for (const userId of userIds.values()) {
    const paid = await db.order.findMany({
      where: { storeId: store.id, userId, status: { in: ["PAID", "FULFILLED"] } },
      select: { totalCents: true, loyaltyPointsEarned: true },
    });
    await db.user.update({
      where: { id: userId },
      data: {
        completedOrders: paid.length,
        lifetimeSpend: paid.reduce((sum, order) => sum + order.totalCents, 0),
        loyaltyPoints: paid.reduce((sum, order) => sum + order.loyaltyPointsEarned, 0),
      },
    });
  }

  // No natural key, so the seeded incidents are deleted and rewritten.
  await db.fraudIncident.deleteMany({
    where: { storeId: store.id, sessionKey: { startsWith: "seed-" } },
  });

  const risky = await db.order.findMany({
    where: { storeId: store.id, orderNumber: { startsWith: `${prefix}-DEMO-` }, riskScore: { gte: 55 } },
    orderBy: { riskScore: "desc" },
    take: 5,
    select: { id: true, userId: true, guestEmail: true, sessionKey: true, riskScore: true, traceId: true },
  });

  const REVIEWS = ["OPEN", "OPEN", "CONFIRMED_FRAUD", "FALSE_POSITIVE", "DISMISSED"] as const;
  let incidents = 0;
  for (const [index, order] of risky.entries()) {
    const level = order.riskScore >= 85 ? "CRITICAL" : order.riskScore >= 70 ? "HIGH" : "MEDIUM";
    const decision = order.riskScore >= 85 ? "BLOCK" : order.riskScore >= 70 ? "REVIEW" : "CHALLENGE";
    await db.fraudIncident.create({
      data: {
        storeId: store.id,
        orderId: order.id,
        userId: order.userId,
        sessionKey: order.sessionKey,
        email: order.guestEmail,
        ipAddress: `86.120.${10 + index}.${40 + index * 7}`,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        riskScore: order.riskScore,
        riskLevel: level,
        decision,
        signals: {
          velocity: index % 2 === 0,
          addressMismatch: index % 3 === 0,
          highValueCart: true,
        } as Prisma.InputJsonValue,
        matchedRuleKeys: ["risk-score-threshold"],
        rulesetVersion: 1,
        traceId: order.traceId,
        explanation: {
          summary: `Scor de risc ${order.riskScore} peste pragul configurat.`,
        } as Prisma.InputJsonValue,
        reviewStatus: REVIEWS[index % REVIEWS.length]!,
        createdAt: daysAgo(index * 3 + 1, 15),
      },
    });
    incidents++;
  }

  // These back the per-rule statistics and the candidate simulation. Rewritten
  // on every seed so they do not pile up.
  await db.evaluationEvent.deleteMany({ where: { storeId: store.id, source: "seed" } });

  const events: Prisma.EvaluationEventCreateManyInput[] = [];
  for (let i = 0; i < 140; i++) {
    const product = pick(random, products);
    const customer = customers.length ? pick(random, customers) : null;
    const tier = customer?.loyaltyTier ?? "STANDARD";
    const percentOff = tier === "VIP" ? 15 : tier === "GOLD" ? 10 : 0;
    const matched = percentOff ? [tier === "VIP" ? "vip-discount" : "gold-discount"] : [];

    events.push({
      storeId: store.id,
      category: "PRICING",
      rulesetVersion: 1,
      traceId: `seed-eval-${i}`,
      matchedRuleKeys: matched,
      decision: {
        baseCents: product.basePriceCents,
        finalCents: Math.round(product.basePriceCents * (1 - percentOff / 100)),
        discountPercent: percentOff,
      } as Prisma.InputJsonValue,
      context: {
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category,
          brand: product.brand,
          basePriceCents: product.basePriceCents,
          stock: product.stock,
          tags: product.tags,
        },
        customer: {
          loyaltyTier: tier,
          loyaltyPoints: Math.floor(random() * 900),
          completedOrders: Math.floor(random() * 12),
          lifetimeSpend: Math.floor(random() * 500000),
          country: customer?.country ?? "RO",
        },
        session: { isGuest: !customer, isAuthenticated: !!customer },
      } as Prisma.InputJsonValue,
      usedDefault: matched.length === 0,
      source: "seed",
      createdAt: daysAgo(Math.floor(random() * 30), 8 + Math.floor(random() * 12)),
    });
  }
  await db.evaluationEvent.createMany({ data: events });

  return { customers: customers.length, orders, incidents, events: events.length };
}
