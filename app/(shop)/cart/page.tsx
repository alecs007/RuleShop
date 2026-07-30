import type { Metadata } from "next";
import { getActiveStore } from "@/lib/shop/store";
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

export default async function CartPage() {
  const store = await getActiveStore();
  const cart = await readCart(store.id);
  const prices = await getPriceViews(cart?.items.map((i) => i.product) ?? []);
  const totals = computeTotals(cart, prices);

  if (!cart || cart.items.length === 0) {
    return (
      <div className="appear-content py-8">
        <EmptyCart />
      </div>
    );
  }

  // Livrarea: metodele magazinului trecute prin rulesetul SHIPPING publicat.
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
    // Disponibilitatea se reverifica la fiecare afisare: o regula publicata
    // intre timp poate bloca un produs care era deja in cos.
    getAvailabilityViews(cart.items.map((i) => i.product)),
  ]);

  // Tot ce vede clientul trece prin componenta de coș, care aplică
  // modificările optimist — deci liniile pleacă spre client ca date simple,
  // cu deciziile de reguli deja rezolvate aici.
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
