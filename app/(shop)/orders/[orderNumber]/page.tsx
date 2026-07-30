import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, ShieldCheck, Truck } from "lucide-react";
import { getSessionUser } from "@/lib/auth/guards";
import { getActiveStore } from "@/lib/shop/store";
import { getSessionKey } from "@/lib/shop/session";
import { findOrderForViewer } from "@/lib/shop/orders";
import { getRuleNames } from "@/lib/rules/service";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "@/lib/shop/order-status";
import { RISK_LEVEL_LABELS, type RiskLevelValue } from "@/lib/shop/fraud-risk";
import { paymentMethodLabel } from "@/lib/shop/payment";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { ChallengeForm } from "@/components/shop/challenge-form";

export const metadata: Metadata = { title: "Comanda ta" };

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
  challenge?: { code?: string; verified?: boolean };
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const store = await getActiveStore();
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

  const appliedRules = order.matchedRuleKeys.map(
    (key) => ruleNames.get(key) ?? key,
  );

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

      {/* Rezultatul verificarii antifraudă, pe intelesul clientului */}
      <div className="mt-6 space-y-3">
        {needsChallenge && challenge?.code && (
          <ChallengeForm orderNumber={order.orderNumber} demoCode={challenge.code} />
        )}

        {order.status === "AWAITING_REVIEW" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <Clock className="mt-0.5 size-5 shrink-0 text-caution" strokeWidth={1.75} />
            <div>
              <p className="font-medium text-caution">Comandă în verificare</p>
              <p className="mt-0.5 text-ink-muted">
                Un operator o va confirma în cel mai scurt timp. Nu s-a efectuat
                nicio plată până atunci.
              </p>
            </div>
          </div>
        )}

        {order.status === "REJECTED" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
            <p className="font-medium text-critical">Comandă respinsă</p>
            <p className="mt-0.5 text-ink-muted">
              În urma verificării, comanda nu a putut fi procesată.
            </p>
          </div>
        )}

        {(order.status === "PAID" || order.status === "FULFILLED") && (
          <div className="flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" strokeWidth={1.75} />
            <div>
              <p className="font-medium text-positive">Comandă confirmată</p>
              <p className="mt-0.5 text-ink-muted">
                Plata a fost înregistrată ({paymentMethodLabel(order.paymentMethod ?? "")}).
              </p>
            </div>
          </div>
        )}

        {order.status === "PENDING" && !needsChallenge && (
          <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-raised p-4 text-sm">
            <Clock className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={1.75} />
            <div>
              <p className="font-medium">Comandă înregistrată</p>
              <p className="mt-0.5 text-ink-muted">
                Plata se încasează la livrare ({paymentMethodLabel(order.paymentMethod ?? "")}).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Produsele */}
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

      {/* Deciziile rule engine-ului pentru aceasta comanda */}
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
          href="/products"
          className="inline-flex h-11 items-center rounded-lg bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Continuă cumpărăturile
        </Link>
        <Link
          href="/account/orders"
          className="inline-flex h-11 items-center rounded-lg border border-line px-5 text-sm font-medium transition-colors hover:border-ink-faint"
        >
          Comenzile mele
        </Link>
      </div>
    </div>
  );
}
