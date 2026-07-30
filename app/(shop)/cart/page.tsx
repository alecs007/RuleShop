import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { getActiveStore } from "@/lib/shop/store";
import { computeTotals, readCart } from "@/lib/shop/cart";
import { getPriceViews } from "@/lib/shop/pricing";
import { cartShippingFacts, quoteShipping } from "@/lib/shop/shipping";
import { getRuleNames } from "@/lib/rules/service";
import { formatMoney } from "@/lib/utils/money";
import {
  ShippingExplanation,
  ShippingOptions,
  ShippingSummaryRow,
} from "@/components/shop/shipping-options";
import { removeItemAction, setQuantityAction } from "./actions";

export const metadata: Metadata = { title: "Coșul meu" };

export default async function CartPage() {
  const store = await getActiveStore();
  const cart = await readCart(store.id);
  const prices = await getPriceViews(cart?.items.map((i) => i.product) ?? []);
  const totals = computeTotals(cart, prices);

  if (!cart || cart.items.length === 0) {
    return (
      <div className="appear-content flex flex-col items-center py-24 text-center">
        <ShoppingBag className="size-10 text-ink-faint" strokeWidth={1.5} />
        <h1 className="mt-4 text-xl font-semibold">Coșul tău este gol</h1>
        <p className="mt-1 text-ink-muted">
          Produsele adăugate rămân salvate, chiar și fără cont.
        </p>
        <Link
          href="/products"
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Vezi produsele
        </Link>
      </div>
    );
  }

  // Livrarea: metodele magazinului trecute prin rulesetul SHIPPING publicat.
  const [quote, ruleNames] = await Promise.all([
    quoteShipping({
      storeId: store.id,
      storeSettings: store.settings,
      currency: totals.currency,
      cart: cartShippingFacts(cart, totals),
      selectedMethodId: cart.shippingMethodId,
    }),
    getRuleNames(store.id),
  ]);
  const shippingCents = quote.selected?.costCents ?? 0;

  return (
    <div className="appear-content py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Coșul meu</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Lista de produse */}
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface-raised">
          {cart.items.map((item) => {
            const image = item.product.imageUrls[0];
            const view = prices.get(item.productId);
            const unitCents = view?.finalCents ?? item.product.basePriceCents;
            const lineTotal = item.quantity * unitCents;
            return (
              <li key={item.id} className="flex gap-4 p-4">
                <Link
                  href={`/products/${item.product.slug}`}
                  className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100 sm:size-24"
                >
                  {image && (
                    <Image
                      src={image}
                      alt={item.product.name}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/products/${item.product.slug}`}
                        className="line-clamp-2 text-sm font-medium hover:underline"
                      >
                        {item.product.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {formatMoney(unitCents, item.product.currency)} / buc
                        {view && view.discountPercent > 0 && (
                          <span className="ml-1.5 text-critical">
                            (−{view.discountPercent}%)
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(lineTotal, item.product.currency)}
                    </p>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-3">
                    {/* Cantitate: butoane +/- ca formulare separate (functioneaza fara JS) */}
                    <div className="flex h-9 items-center rounded-lg border border-line">
                      <form action={setQuantityAction}>
                        <input
                          type="hidden"
                          name="productId"
                          value={item.productId}
                        />
                        <input
                          type="hidden"
                          name="quantity"
                          value={item.quantity - 1}
                        />
                        <button
                          aria-label="Scade cantitatea"
                          className="flex h-9 w-9 cursor-pointer items-center justify-center text-ink-muted transition-colors hover:text-ink"
                        >
                          <Minus className="size-3.5" />
                        </button>
                      </form>
                      <span className="w-7 text-center text-sm tabular-nums">
                        {item.quantity}
                      </span>
                      <form action={setQuantityAction}>
                        <input
                          type="hidden"
                          name="productId"
                          value={item.productId}
                        />
                        <input
                          type="hidden"
                          name="quantity"
                          value={item.quantity + 1}
                        />
                        <button
                          aria-label="Crește cantitatea"
                          disabled={item.quantity >= item.product.stock}
                          className="flex h-9 w-9 cursor-pointer items-center justify-center text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </form>
                    </div>

                    <form action={removeItemAction}>
                      <input
                        type="hidden"
                        name="productId"
                        value={item.productId}
                      />
                      <button
                        aria-label="Șterge din coș"
                        className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-red-50 hover:text-critical"
                      >
                        <Trash2 className="size-4" strokeWidth={1.75} />
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Sumar */}
        <aside className="h-fit rounded-xl border border-line bg-surface-raised p-5 lg:sticky lg:top-32">
          <h2 className="font-semibold">Sumar comandă</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">
                Subtotal ({totals.itemCount}{" "}
                {totals.itemCount === 1 ? "produs" : "produse"})
              </dt>
              <dd className="font-medium tabular-nums">
                {formatMoney(totals.subtotalCents, totals.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Livrare</dt>
              <dd>
                <ShippingSummaryRow quote={quote} />
              </dd>
            </div>
          </dl>

          {/* Metodele de livrare, cu costul decis de rulesetul SHIPPING */}
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs font-medium tracking-wide text-ink-faint">
              Metodă de livrare
            </p>
            <ShippingOptions quote={quote} />
            <ShippingExplanation quote={quote} ruleNames={ruleNames} />
          </div>

          <div className="mt-4 flex justify-between border-t border-line pt-4">
            <span className="font-semibold">Total</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(
                totals.subtotalCents + shippingCents,
                totals.currency,
              )}
            </span>
          </div>

          {/* Checkout-ul vine in pasul urmator */}
          <button
            disabled
            title="Checkout-ul este în lucru"
            className="mt-5 h-12 w-full cursor-not-allowed rounded-lg bg-zinc-300 font-medium text-zinc-500"
          >
            Continuă spre checkout
          </button>
          <p className="mt-3 text-center text-xs text-ink-faint">
            Poți comanda ca guest sau autentificat.
          </p>
        </aside>
      </div>
    </div>
  );
}
