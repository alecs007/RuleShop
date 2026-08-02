import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Gift, Sparkles } from "lucide-react";
import { getSessionUser } from "@/lib/auth/guards";
import { requireStore } from "@/lib/shop/store";
import { storeHref } from "@/lib/shop/routing";
import { computeTotals, readCart } from "@/lib/shop/cart";
import { getPriceViews } from "@/lib/shop/pricing";
import { cartShippingFacts, quoteShipping } from "@/lib/shop/shipping";
import { explainLoyalty, getLoyaltyView, pointsLabel } from "@/lib/shop/loyalty";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { CheckoutForm } from "@/components/shop/checkout-form";

export const metadata: Metadata = { title: "Finalizare comandă" };

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ store: string }>;
}) {
  const store = await requireStore((await params).store);
  const cart = await readCart(store.id);
  if (!cart || cart.items.length === 0) redirect(storeHref(store.pathPrefix, "/cart"));

  const [viewer, prices] = await Promise.all([
    getSessionUser(),
    getPriceViews(cart.items.map((i) => i.product)),
  ]);
  const totals = computeTotals(cart, prices);
  const cartFacts = cartShippingFacts(cart, totals);
  const quote = await quoteShipping({
    storeId: store.id,
    storeSettings: store.settings,
    currency: totals.currency,
    cart: cartFacts,
    selectedMethodId: cart.shippingMethodId,
  });

  const shippingCents = quote.selected?.costCents ?? 0;
  const totalCents = totals.subtotalCents + shippingCents;

  // The same LOYALTY decision the order will freeze, so the customer sees
  // what they earn beforehand.
  const loyalty = await getLoyaltyView({
    storeId: store.id,
    cart: cartFacts,
    order: { totalCents, shippingCents },
  });

  return (
    <div className="py-8">
      <Link
        href={storeHref(store.pathPrefix, "/cart")}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Înapoi la coș
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Finalizare comandă
      </h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <CheckoutForm
          prefix={store.pathPrefix}
          defaultEmail={viewer?.email}
          defaultName={viewer?.name}
        />

        {/* The order summary, on the same decisions as the cart */}
        <aside className="h-fit rounded-xl border border-line bg-surface-raised p-5 lg:sticky lg:top-24">
          <h2 className="font-semibold">Comanda ta</h2>

          <ul className="mt-4 space-y-3">
            {cart.items.map((item) => {
              const view = prices.get(item.productId);
              const unit = view?.finalCents ?? item.product.basePriceCents;
              return (
                <li key={item.id} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="line-clamp-2">{item.product.name}</span>
                    <span className="text-xs text-ink-faint">
                      {item.quantity} × {formatMoney(unit, totals.currency)}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(unit * item.quantity, totals.currency)}
                  </span>
                </li>
              );
            })}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular-nums">
                {formatMoney(totals.subtotalCents, totals.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">
                Livrare
                {quote.selected && (
                  <span className="text-ink-faint"> · {quote.selected.label}</span>
                )}
              </dt>
              <dd className="tabular-nums">
                {shippingCents === 0
                  ? "Gratuită"
                  : formatMoney(shippingCents, totals.currency)}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex justify-between border-t border-line pt-4">
            <span className="font-semibold">Total</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(totalCents, totals.currency)}
            </span>
          </div>

          {quote.selectionChanged && (
            <p className="mt-3 text-xs text-caution">
              Metoda de livrare aleasă nu mai este disponibilă — am trecut pe{" "}
              {quote.selected?.label}.
            </p>
          )}

          {/* The LOYALTY decision, visible before placing the order */}
          {(loyalty.points > 0 || loyalty.benefits.length > 0) && (
            <div className="mt-4 rounded-lg border border-line bg-surface p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="size-4 text-accent" strokeWidth={1.75} />
                {loyalty.creditable ? (
                  <>Câștigi {pointsLabel(loyalty.points)}</>
                ) : (
                  <>Cu un cont ai câștiga {pointsLabel(loyalty.points)}</>
                )}
                {loyalty.extraPoints > 0 && (
                  <Badge tone="positive">+{loyalty.extraPoints} din reguli</Badge>
                )}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {explainLoyalty(loyalty)}
                {!loyalty.creditable &&
                  " · punctele se acumulează doar pe un cont autentificat"}
              </p>

              {loyalty.benefits.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {loyalty.benefits.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-start gap-1.5 text-xs text-ink-muted"
                    >
                      <Gift
                        className="mt-0.5 size-3.5 shrink-0 text-accent"
                        strokeWidth={1.75}
                      />
                      {benefit}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
