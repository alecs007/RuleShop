import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ShieldAlert, Truck, Zap } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getRuleNames } from "@/lib/rules/service";
import {
  allowedTransitions,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  TRANSITION_LABELS,
} from "@/lib/shop/order-status";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { updateOrderStatusAction } from "../actions";

export const metadata: Metadata = { title: "Detalii comandă" };

interface Address {
  name?: string;
  phone?: string;
  country?: string;
  city?: string;
  street?: string;
  postalCode?: string;
}

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
}

function AddressBlock({ title, address }: { title: string; address: Address }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {title}
      </p>
      <p className="mt-1 text-sm">
        {address.name}
        {address.phone && ` · ${address.phone}`}
      </p>
      <p className="text-sm text-ink-muted">
        {[address.street, address.city, address.postalCode, address.country]
          .filter(Boolean)
          .join(", ")}
      </p>
    </div>
  );
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const { storeId } = await requireStaff();

  const order = await prisma.order.findUnique({
    where: { storeId_orderNumber: { storeId, orderNumber } },
    include: {
      items: true,
      user: { select: { email: true, name: true, loyaltyTier: true } },
    },
  });
  if (!order) notFound();

  const ruleNames = await getRuleNames(storeId);
  const nameOf = (key: string) => ruleNames.get(key) ?? key;
  const snapshot = (order.decisionSnapshot ?? {}) as DecisionSnapshot;
  const versions = (order.rulesetVersions ?? {}) as Record<string, number>;
  const transitions = allowedTransitions(order.status);
  const placed = new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(order.placedAt ?? order.createdAt);

  return (
    <div className="appear-content">
      <nav
        className="flex items-center gap-1.5 text-sm text-ink-muted"
        aria-label="Breadcrumb"
      >
        <Link href="/admin/orders" className="transition-colors hover:text-ink">
          Comenzi
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink">{order.orderNumber}</span>
      </nav>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {placed} · {order.user?.email ?? order.guestEmail ?? "—"}{" "}
            {order.user
              ? `(cont, ${order.user.loyaltyTier})`
              : "(guest)"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={ORDER_STATUS_TONES[order.status]}>
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
            {order.paymentMethod && <Badge>plată: {order.paymentMethod}</Badge>}
            {order.riskScore > 0 && (
              <Badge tone="caution">risc {order.riskScore}</Badge>
            )}
          </div>
        </div>

        {/* Gestionarea comenzii: doar tranzitiile permise din statusul curent */}
        {transitions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {transitions.map((next) => (
              <ActionForm
                key={next}
                action={updateOrderStatusAction}
                success={`Comanda este acum „${ORDER_STATUS_LABELS[next]}".`}
                confirm={
                  next === "CANCELLED"
                    ? "Anulezi comanda? Stocul produselor revine în catalog."
                    : undefined
                }
              >
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="status" value={next} />
                <button
                  className={
                    next === "CANCELLED"
                      ? "inline-flex h-9 cursor-pointer items-center rounded-lg px-3.5 text-sm font-medium text-critical transition-colors hover:bg-red-50"
                      : "inline-flex h-9 cursor-pointer items-center rounded-lg bg-ink px-3.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
                  }
                >
                  {TRANSITION_LABELS[next] ?? ORDER_STATUS_LABELS[next]}
                </button>
              </ActionForm>
            ))}
          </div>
        )}
        {order.status === "AWAITING_REVIEW" && (
          <p className="text-sm text-ink-muted">
            Comanda așteaptă verificarea antifraudă —{" "}
            <Link href="/admin/fraud" className="text-accent hover:underline">
              decide-o din pagina Antifraudă
            </Link>
            .
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Liniile comenzii, cu preturile decise de reguli */}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3 font-medium">Produs</th>
                  <th className="px-4 py-3 font-medium text-right">Cant.</th>
                  <th className="hidden px-4 py-3 font-medium text-right sm:table-cell">
                    Preț unitar
                  </th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {order.items.map((item) => {
                  const applied = (item.appliedRules ?? []) as string[];
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-ink-faint">{item.sku}</p>
                        {applied.length > 0 && (
                          <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-muted">
                            <Zap
                              className="mt-0.5 size-3 shrink-0 text-accent"
                              strokeWidth={1.75}
                            />
                            {applied.map(nameOf).join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                        {formatMoney(item.finalPriceCents, order.currency)}
                        {item.finalPriceCents !== item.basePriceCents && (
                          <s className="ml-1.5 text-xs text-ink-faint">
                            {formatMoney(item.basePriceCents, order.currency)}
                          </s>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatMoney(item.lineTotalCents, order.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Adrese */}
          <div className="grid gap-4 rounded-xl border border-line bg-surface-raised p-4 sm:grid-cols-2">
            <AddressBlock
              title="Livrare"
              address={order.shippingAddress as Address}
            />
            <AddressBlock
              title="Facturare"
              address={order.billingAddress as Address}
            />
          </div>
        </div>

        {/* Sumar + deciziile motorului */}
        <aside className="h-fit space-y-4">
          <div className="rounded-xl border border-line bg-surface-raised p-4">
            <h2 className="font-semibold">Sumar</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="tabular-nums">
                  {formatMoney(order.subtotalCents, order.currency)}
                </dd>
              </div>
              {order.discountCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Reduceri</dt>
                  <dd className="tabular-nums text-critical">
                    −{formatMoney(order.discountCents, order.currency)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-muted">Livrare</dt>
                <dd className="tabular-nums">
                  {formatMoney(order.shippingCents, order.currency)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">
                  {formatMoney(order.totalCents, order.currency)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-line bg-surface-raised p-4">
            <h2 className="font-semibold">Deciziile motorului</h2>
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <Truck className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
                <div>
                  <p>
                    {snapshot.shipping?.label ?? order.shippingMethod ?? "—"} ·{" "}
                    <span className="tabular-nums">
                      {formatMoney(snapshot.shipping?.costCents ?? order.shippingCents, order.currency)}
                    </span>
                  </p>
                  {(snapshot.shipping?.matchedRules?.length ?? 0) > 0 && (
                    <p className="text-xs text-ink-muted">
                      {snapshot.shipping!.matchedRules!.map(nameOf).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
                <div>
                  <p>
                    Antifraudă: {snapshot.fraud?.decision ?? "—"}
                    {typeof snapshot.fraud?.riskScore === "number" &&
                      ` · scor ${snapshot.fraud.riskScore}`}
                  </p>
                  {(snapshot.fraud?.matchedRules?.length ?? 0) > 0 && (
                    <p className="text-xs text-ink-muted">
                      {snapshot.fraud!.matchedRules!.map(nameOf).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              {Object.keys(versions).length > 0 && (
                <p className="border-t border-line pt-2 text-xs text-ink-faint">
                  Versiuni de reguli:{" "}
                  {Object.entries(versions)
                    .map(([cat, v]) => `${cat} v${v}`)
                    .join(", ")}
                  {order.traceId && ` · trace ${order.traceId}`}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
