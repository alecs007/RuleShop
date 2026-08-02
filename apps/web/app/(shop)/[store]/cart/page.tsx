import type { Metadata } from "next";
import { requireStore } from "@/lib/shop/store";
import { computeTotals, readCart } from "@/lib/shop/cart";
import { getPriceViews } from "@/lib/shop/pricing";
import {
  getAvailabilityViews,
  unavailableMessage,
} from "@/lib/shop/availability";
import { cartShippingFacts, quoteShipping } from "@/lib/shop/shipping";
import { getRuleNames } from "@/lib/rules/service";
import { ShippingExplanation } from "@/components/shop/shipping-options";
import { CartView, type CartLineView } from "@/components/shop/cart-view";
import { EmptyCart } from "@/components/shop/empty-cart";

export const metadata: Metadata = { title: "Coșul meu" };

export default async function CartPage({
  params,
}: {
  params: Promise<{ store: string }>;
}) {
  const store = await requireStore((await params).store);
  const cart = await readCart(store.id);
  const prices = await getPriceViews(cart?.items.map((i) => i.product) ?? []);
  const totals = computeTotals(cart, prices);

  if (!cart || cart.items.length === 0) {
    return (
      <div className="appear-content py-8">
        <EmptyCart prefix={store.pathPrefix} />
      </div>
    );
  }

  // The store's methods, run through the published SHIPPING ruleset.
  const [quote, ruleNames, availability] = await Promise.all([
    quoteShipping({
      storeId: store.id,
      storeSettings: store.settings,
      currency: totals.currency,
      cart: cartShippingFacts(cart, totals),
      selectedMethodId: cart.shippingMethodId,
      record: "cart",
    }),
    getRuleNames(store.id),
    // Re-checked on every render: a rule published meanwhile can block a
    // product that was already in the cart.
    getAvailabilityViews(cart.items.map((i) => i.product)),
  ]);

  // The cart component applies changes optimistically, so the lines leave
  // here as plain data with the rule decisions already resolved.
  const lines: CartLineView[] = cart.items.map((item) => {
    const price = prices.get(item.productId);
    const stock = availability.get(item.productId)!;
    return {
      productId: item.productId,
      slug: item.product.slug,
      name: item.product.name,
      image: item.product.imageUrls[0],
      unitCents: price?.finalCents ?? item.product.basePriceCents,
      discountPercent: price?.discountPercent ?? 0,
      quantity: item.quantity,
      maxPerOrder: stock.maxPerOrder,
      available: stock.available,
      unavailableMessage: stock.available
        ? undefined
        : unavailableMessage(stock, item.product.name),
    };
  });

  return (
    <div className="appear-content py-8">
      <CartView
        prefix={store.pathPrefix}
        lines={lines}
        currency={totals.currency}
        shippingOptions={quote.options.map((option) => ({
          id: option.id,
          label: option.label,
          etaDaysMin: option.etaDaysMin,
          etaDaysMax: option.etaDaysMax,
          costCents: option.costCents,
          baseCostCents: option.baseCostCents,
          free: option.free,
        }))}
        selectedMethodId={quote.selected?.id ?? null}
        methodForced={Boolean(quote.forcedMethodId)}
        shippingNotes={
          <ShippingExplanation quote={quote} ruleNames={ruleNames} />
        }
      />
    </div>
  );
}
