"use client";

import { useEffect, useOptimistic, useRef, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils/money";
import { EmptyCart } from "./empty-cart";
import {
  removeItemAction,
  selectShippingMethodAction,
  setQuantityAction,
} from "@/app/(shop)/[store]/cart/actions";
import { storeHref } from "@/lib/shop/routing";

/**
 * The cart, with instant feedback. Every change is applied locally through
 * `useOptimistic` before it reaches the server action: rendering this page
 * costs several rule evaluations, so a round trip is visible.
 *
 * The optimism only covers what can be computed from data already at hand —
 * the subtotal and the chosen method's cost. Anything rule-dependent, like
 * shipping turning free over a threshold, corrects itself when the server
 * answers. The trade-off is that the buttons need JavaScript.
 */

export interface CartLineView {
  productId: string;
  slug: string;
  name: string;
  image?: string;
  unitCents: number;
  discountPercent: number;
  quantity: number;
  maxPerOrder: number;
  available: boolean;
  /** Why it is unavailable, formatted on the server. */
  unavailableMessage?: string;
}

export interface CartShippingOptionView {
  id: string;
  label: string;
  etaDaysMin: number;
  etaDaysMax: number;
  costCents: number;
  baseCostCents: number;
  free: boolean;
}

interface CartState {
  /** Requested quantity per product, only for lines the user touched. */
  quantities: Record<string, number>;
  removedIds: string[];
  methodId: string | null;
}

type CartMutation =
  | { type: "quantity"; productId: string; quantity: number }
  | { type: "remove"; productId: string }
  | { type: "method"; methodId: string };

function reduce(state: CartState, mutation: CartMutation): CartState {
  switch (mutation.type) {
    case "quantity":
      // Zero quantity removes the line, as it does on the server.
      return mutation.quantity <= 0
        ? { ...state, removedIds: [...state.removedIds, mutation.productId] }
        : {
            ...state,
            quantities: {
              ...state.quantities,
              [mutation.productId]: mutation.quantity,
            },
          };
    case "remove":
      return { ...state, removedIds: [...state.removedIds, mutation.productId] };
    case "method":
      return { ...state, methodId: mutation.methodId };
  }
}

function eta(min: number, max: number): string {
  if (min === 0 && max === 0) return "astăzi";
  if (min === max) return `${max} ${max === 1 ? "zi" : "zile"}`;
  return `${min}–${max} zile`;
}

export function CartView({
  prefix,
  lines,
  currency,
  shippingOptions,
  selectedMethodId,
  /** A method forced by a rule; the customer's choice then has no effect. */
  methodForced = false,
  shippingNotes,
}: {
  /** The store prefix, so links stay inside the current store. */
  prefix: string | null;
  lines: CartLineView[];
  currency: string;
  shippingOptions: CartShippingOptionView[];
  selectedMethodId: string | null;
  methodForced?: boolean;
  /** The shipping decision's explanation, rendered on the server. */
  shippingNotes?: React.ReactNode;
}) {
  const [state, mutate] = useOptimistic<CartState, CartMutation>(
    { quantities: {}, removedIds: [], methodId: selectedMethodId },
    reduce,
  );
  // Optimistic updates need a transition; outside one React discards them.
  const [, startTransition] = useTransition();

  /**
   * Requested quantities kept outside the render: two clicks in one frame
   * would read the same state and lose an increment.
   */
  const desired = useRef<Record<string, number>>({});
  useEffect(() => {
    desired.current = Object.fromEntries(
      lines.map((line) => [line.productId, line.quantity]),
    );
  }, [lines]);

  const visible = lines
    .filter((line) => !state.removedIds.includes(line.productId))
    .map((line) => ({
      ...line,
      quantity: state.quantities[line.productId] ?? line.quantity,
    }));

  if (visible.length === 0) return <EmptyCart prefix={prefix} />;

  const itemCount = visible.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalCents = visible.reduce(
    (sum, line) => sum + line.quantity * line.unitCents,
    0,
  );
  const selected =
    shippingOptions.find((option) => option.id === state.methodId) ?? null;
  const shippingCents = selected?.costCents ?? 0;

  const blockedItems = visible.filter((line) => !line.available);
  const overLimitItems = visible.filter(
    (line) => line.available && line.quantity > line.maxPerOrder,
  );
  const checkoutBlocked = blockedItems.length > 0 || overLimitItems.length > 0;

  function changeQuantity(line: CartLineView, delta: number) {
    const current = desired.current[line.productId] ?? line.quantity;
    const quantity = Math.min(Math.max(current + delta, 0), line.maxPerOrder);
    if (quantity === current) return;
    desired.current[line.productId] = quantity;

    startTransition(async () => {
      mutate({ type: "quantity", productId: line.productId, quantity });

      const data = new FormData();
      data.set("storePrefix", prefix ?? "");
      data.set("productId", line.productId);
      data.set("quantity", String(quantity));
      await setQuantityAction(data);
    });
  }

  function removeLine(line: CartLineView) {
    delete desired.current[line.productId];

    startTransition(async () => {
      mutate({ type: "remove", productId: line.productId });

      const data = new FormData();
      data.set("storePrefix", prefix ?? "");
      data.set("productId", line.productId);
      await removeItemAction(data);
      // The action no longer redirects, so there is no navigation to carry a
      // flash message through the URL.
      toast.info("Produs șters din coș.", { description: line.name });
    });
  }

  function selectMethod(option: CartShippingOptionView) {
    if (option.id === state.methodId) return;

    startTransition(async () => {
      mutate({ type: "method", methodId: option.id });

      const data = new FormData();
      data.set("storePrefix", prefix ?? "");
      data.set("methodId", option.id);
      await selectShippingMethodAction(data);
    });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Coșul meu</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface-raised">
          {visible.map((line) => {
            const lineTotal = line.quantity * line.unitCents;
            const overLimit = line.available && line.quantity > line.maxPerOrder;
            return (
              <li key={line.productId} className="flex gap-4 p-4">
                <Link
                  href={storeHref(prefix, `/products/${line.slug}`)}
                  className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100 sm:size-24"
                >
                  {line.image && (
                    <Image
                      src={line.image}
                      alt={line.name}
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
                        href={storeHref(prefix, `/products/${line.slug}`)}
                        className="line-clamp-2 text-sm font-medium hover:underline"
                      >
                        {line.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {formatMoney(line.unitCents, currency)} / buc
                        {line.discountPercent > 0 && (
                          <span className="ml-1.5 text-critical">
                            (−{line.discountPercent}%)
                          </span>
                        )}
                      </p>
                      {/* Blocked by a rule, or out of stock */}
                      {!line.available && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-critical">
                          <TriangleAlert
                            className="size-3.5 shrink-0"
                            strokeWidth={1.75}
                          />
                          {line.unavailableMessage}
                        </p>
                      )}
                      {overLimit && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-caution">
                          <TriangleAlert
                            className="size-3.5 shrink-0"
                            strokeWidth={1.75}
                          />
                          Poți comanda maximum {line.maxPerOrder}{" "}
                          {line.maxPerOrder === 1 ? "bucată" : "bucăți"} — scade
                          cantitatea.
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(lineTotal, currency)}
                    </p>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex h-9 items-center rounded-lg border border-line">
                      <button
                        type="button"
                        aria-label="Scade cantitatea"
                        onClick={() => changeQuantity(line, -1)}
                        className="flex h-9 w-9 cursor-pointer items-center justify-center text-ink-muted transition-colors hover:text-ink"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Crește cantitatea"
                        disabled={line.quantity >= line.maxPerOrder}
                        onClick={() => changeQuantity(line, 1)}
                        className="flex h-9 w-9 cursor-pointer items-center justify-center text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      aria-label="Șterge din coș"
                      onClick={() => removeLine(line)}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-red-50 hover:text-critical"
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="h-fit rounded-xl border border-line bg-surface-raised p-5 lg:sticky lg:top-32">
          <h2 className="font-semibold">Sumar comandă</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">
                Subtotal ({itemCount} {itemCount === 1 ? "produs" : "produse"})
              </dt>
              <dd className="font-medium tabular-nums">
                {formatMoney(subtotalCents, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Livrare</dt>
              <dd>
                {!selected ? (
                  <span className="text-ink-muted">indisponibilă</span>
                ) : selected.free ? (
                  <span className="font-medium text-positive">Gratuită</span>
                ) : (
                  <span className="font-medium tabular-nums">
                    {formatMoney(selected.costCents, currency)}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs font-medium tracking-wide text-ink-faint">
              Metodă de livrare
            </p>
            {shippingOptions.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Momentan nu există metode de livrare disponibile pentru acest coș.
              </p>
            ) : (
              <ul className="space-y-1">
                {shippingOptions.map((option) => {
                  const reduced = option.costCents < option.baseCostCents;
                  const isSelected = option.id === state.methodId;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        disabled={methodForced}
                        onClick={() => selectMethod(option)}
                        className={
                          isSelected
                            ? "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-ink bg-surface px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-default"
                            : "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-line hover:bg-surface disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"
                        }
                      >
                        <span
                          aria-hidden
                          className={
                            isSelected
                              ? "flex size-4 shrink-0 items-center justify-center rounded-full bg-ink text-white"
                              : "size-4 shrink-0 rounded-full border border-line"
                          }
                        >
                          {isSelected && (
                            <Check className="size-3" strokeWidth={3} />
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span
                            className={
                              isSelected ? "font-medium text-ink" : "text-ink"
                            }
                          >
                            {option.label}
                          </span>
                          <span className="ml-1.5 text-xs text-ink-faint">
                            {eta(option.etaDaysMin, option.etaDaysMax)}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-baseline gap-1.5">
                          {reduced && option.baseCostCents > 0 && (
                            <s className="text-xs tabular-nums text-ink-faint">
                              {formatMoney(option.baseCostCents, currency)}
                            </s>
                          )}
                          {option.free ? (
                            <Badge tone="positive">Gratuită</Badge>
                          ) : (
                            <span className="font-medium tabular-nums">
                              {formatMoney(option.costCents, currency)}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {shippingNotes}
          </div>

          <div className="mt-4 flex justify-between border-t border-line pt-4">
            <span className="font-semibold">Total</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(subtotalCents + shippingCents, currency)}
            </span>
          </div>

          {checkoutBlocked ? (
            <>
              <span
                aria-disabled
                className="mt-5 flex h-12 w-full cursor-not-allowed items-center justify-center rounded-lg bg-ink/40 font-medium text-white"
              >
                Continuă spre checkout
              </span>
              <p className="mt-3 text-center text-xs text-critical">
                {blockedItems.length > 0
                  ? "Scoate din coș produsele indisponibile pentru a continua."
                  : "Scade cantitățile peste limită pentru a continua."}
              </p>
            </>
          ) : (
            <>
              <Link
                href={storeHref(prefix, "/checkout")}
                className="mt-5 flex h-12 w-full items-center justify-center rounded-lg bg-ink font-medium text-white transition-colors hover:bg-zinc-700"
              >
                Continuă spre checkout
              </Link>
              <p className="mt-3 text-center text-xs text-ink-faint">
                Poți comanda ca guest sau autentificat.
              </p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
