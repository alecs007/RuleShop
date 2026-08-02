import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Ban,
  CheckCircle2,
  Clock,
  Gift,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/guards";
import { requireStore } from "@/lib/shop/store";
import { storeHref } from "@/lib/shop/routing";
import { getSessionKey } from "@/lib/shop/session";
import { findOrderForViewer } from "@/lib/shop/orders";
import { getRuleNames } from "@/lib/rules/service";
import {
  ORDER_STATUS_DESCRIPTIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
} from "@ruleshop/storefront";
import { RISK_LEVEL_LABELS, type RiskLevelValue } from "@ruleshop/storefront";
import { paymentMethodLabel } from "@/lib/shop/payment";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { ChallengeForm } from "@/components/shop/challenge-form";
import { OrderTimeline } from "@/components/shop/order-timeline";
import { CancelOrderButton } from "@/components/shop/cancel-order-button";

export const metadata: Metadata = { title: "Comanda ta" };

/** All seven states have an entry, or some orders would go unexplained. */
const STATUS_CARDS: Record<
  OrderStatus,
  {
    icon: typeof Clock;
    className: string;
    iconClassName: string;
    titleClassName: string;
  }
> = {
  PENDING: {
    icon: Clock,
    className: "border-line bg-surface-raised",
    iconClassName: "text-ink-muted",
    titleClassName: "",
  },
  AWAITING_REVIEW: {
    icon: ShieldCheck,
    className: "border-amber-200 bg-amber-50",
    iconClassName: "text-caution",
    titleClassName: "text-caution",
  },
  PAID: {
    icon: CheckCircle2,
    className: "border-green-200 bg-green-50",
    iconClassName: "text-positive",
    titleClassName: "text-positive",
  },
  FULFILLED: {
    icon: PackageCheck,
    className: "border-green-200 bg-green-50",
    iconClassName: "text-positive",
    titleClassName: "text-positive",
  },
  CANCELLED: {
    icon: Ban,
    className: "border-line bg-surface-raised",
    iconClassName: "text-ink-muted",
    titleClassName: "",
  },
  REJECTED: {
    icon: XCircle,
    className: "border-red-200 bg-red-50",
    iconClassName: "text-critical",
    titleClassName: "text-critical",
  },
  REFUNDED: {
    icon: Undo2,
    className: "border-line bg-surface-raised",
    iconClassName: "text-ink-muted",
    titleClassName: "",
  },
};

interface DecisionSnapshot {
  shipping?: {
    label?: string | null;
    costCents?: number;
    baseCostCents?: number;
    matchedRules?: string[];
  };
  fraud?: {
    decision?: string;
    riskScore?: number;
    riskLevel?: string;
    flaggedSignals?: string[];
    matchedRules?: string[];
  };
  loyalty?: {
    basePoints?: number;
    pointsMultiplier?: number;
    bonusPoints?: number;
    points?: number;
    pointsCredited?: number;
    benefits?: string[];
    tier?: string;
  };
  challenge?: { code?: string; verified?: boolean };
}

/** The statuses in which the order's points really count. */
const POINTS_CREDITED_STATUSES: OrderStatus[] = ["PAID", "FULFILLED"];

export default async function OrderPage({
  params,
}: {
  params: Promise<{ store: string; orderNumber: string }>;
}) {
  const { store: segment, orderNumber } = await params;
  const store = await requireStore(segment);
  const [viewer, sessionKey] = await Promise.all([
    getSessionUser(),
    getSessionKey(),
  ]);

  const order = await findOrderForViewer(store.id, orderNumber, {
    userId: viewer?.id ?? null,
    sessionKey,
  });
  if (!order) notFound();

  const ruleNames = await getRuleNames(store.id);
  const snapshot = (order.decisionSnapshot ?? {}) as DecisionSnapshot;
  const challenge = snapshot.challenge;
  const needsChallenge = Boolean(challenge?.code && !challenge.verified);
  const fraud = snapshot.fraud;
  const loyalty = snapshot.loyalty;
  const pointsCredited = POINTS_CREDITED_STATUSES.includes(order.status);

  const appliedRules = order.matchedRuleKeys.map(
    (key) => ruleNames.get(key) ?? key,
  );
  const card = STATUS_CARDS[order.status];
  // Self-service cancellation only before payment; after that it is a refund,
  // which is the operator's call.
  const canCancel = order.status === "PENDING" && !needsChallenge;

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">Comanda</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            #{order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {new Intl.DateTimeFormat("ro-RO", {
              dateStyle: "long",
              timeStyle: "short",
            }).format(order.placedAt ?? order.createdAt)}
          </p>
        </div>
        <Badge tone={ORDER_STATUS_TONES[order.status]}>
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
        <OrderTimeline status={order.status} />
      </div>

      {/* What the status means, plus anything still asked of the customer */}
      <div className="mt-3 space-y-3">
        {needsChallenge && challenge?.code && (
          <ChallengeForm
            prefix={store.pathPrefix}
            orderNumber={order.orderNumber}
            demoCode={challenge.code}
          />
        )}

        <div
          className={`flex items-start gap-2.5 rounded-xl border p-4 text-sm ${card.className}`}
        >
          <card.icon
            className={`mt-0.5 size-5 shrink-0 ${card.iconClassName}`}
            strokeWidth={1.75}
          />
          <div>
            <p className={`font-medium ${card.titleClassName}`}>
              {ORDER_STATUS_LABELS[order.status]}
            </p>
            <p className="mt-0.5 text-ink-muted">
              {ORDER_STATUS_DESCRIPTIONS[order.status]}
              {(order.status === "PENDING" || order.status === "PAID") &&
                order.paymentMethod &&
                ` Metodă de plată: ${paymentMethodLabel(order.paymentMethod)}.`}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface-raised">
        <ul className="divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 p-4 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{item.name}</span>
                <span className="text-xs text-ink-faint">
                  {item.sku} · {item.quantity} ×{" "}
                  {formatMoney(item.finalPriceCents, order.currency)}
                  {item.finalPriceCents < item.basePriceCents && (
                    <s className="ml-1.5">
                      {formatMoney(item.basePriceCents, order.currency)}
                    </s>
                  )}
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {formatMoney(item.lineTotalCents, order.currency)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="space-y-2 border-t border-line p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd className="tabular-nums">
              {formatMoney(order.subtotalCents, order.currency)}
            </dd>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-muted">Reduceri aplicate</dt>
              <dd className="tabular-nums text-critical">
                −{formatMoney(order.discountCents, order.currency)}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="flex items-center gap-1.5 text-ink-muted">
              <Truck className="size-3.5" strokeWidth={1.75} />
              Livrare
              {snapshot.shipping?.label && (
                <span className="text-ink-faint">· {snapshot.shipping.label}</span>
              )}
            </dt>
            <dd className="tabular-nums">
              {order.shippingCents === 0
                ? "Gratuită"
                : formatMoney(order.shippingCents, order.currency)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">
              {formatMoney(order.totalCents, order.currency)}
            </dd>
          </div>
        </dl>
      </div>

      {/* The rule engine's decisions for this order */}
      <div className="mt-6 rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-ink-muted" strokeWidth={1.75} />
          Decizii aplicate
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          {fraud && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-ink-muted">Verificare antifraudă</dt>
              <dd className="flex items-center gap-2">
                <Badge
                  tone={
                    fraud.decision === "ALLOW"
                      ? "positive"
                      : fraud.decision === "BLOCK"
                        ? "critical"
                        : "caution"
                  }
                >
                  {RISK_LEVEL_LABELS[(fraud.riskLevel ?? "LOW") as RiskLevelValue]}
                </Badge>
                <span className="text-xs text-ink-faint tabular-nums">
                  scor {fraud.riskScore ?? 0}
                </span>
              </dd>
            </div>
          )}
          {order.loyaltyPointsEarned > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-ink-muted">
                <Sparkles className="size-3.5" strokeWidth={1.75} />
                Puncte de loialitate
              </dt>
              <dd className="flex items-center gap-2">
                <span className="font-medium tabular-nums">
                  +{order.loyaltyPointsEarned}
                </span>
                <span className="text-xs text-ink-faint">
                  {pointsCredited
                    ? "adăugate în cont"
                    : "se adaugă la confirmarea comenzii"}
                </span>
              </dd>
            </div>
          )}
          {loyalty?.benefits && loyalty.benefits.length > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-ink-muted">
                <Gift className="size-3.5" strokeWidth={1.75} />
                Beneficii acordate
              </dt>
              <dd className="text-right">{loyalty.benefits.join(", ")}</dd>
            </div>
          )}
          {appliedRules.length > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-ink-muted">Reguli care au acționat</dt>
              <dd className="text-right">{appliedRules.join(", ")}</dd>
            </div>
          )}
          {order.traceId && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-ink-muted">Identificator evaluare</dt>
              <dd className="font-mono text-xs text-ink-faint">{order.traceId}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={storeHref(store.pathPrefix, "/products")}
          className="inline-flex h-11 items-center rounded-lg bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Continuă cumpărăturile
        </Link>
        <Link
          href={storeHref(store.pathPrefix, "/orders")}
          className="inline-flex h-11 items-center rounded-lg border border-line px-5 text-sm font-medium transition-colors hover:border-ink-faint"
        >
          Comenzile mele
        </Link>
        {canCancel && <CancelOrderButton prefix={store.pathPrefix} orderNumber={order.orderNumber} />}
      </div>
    </div>
  );
}
