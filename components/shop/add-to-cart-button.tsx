"use client";

import { useActionState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { addToCartAction, type CartActionState } from "@/app/(shop)/cart/actions";

export function AddToCartButton({
  productId,
  maxQuantity,
  disabled,
}: {
  productId: string;
  maxQuantity: number;
  disabled?: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, pending] = useActionState<
    CartActionState | undefined,
    FormData
  >(addToCartAction, undefined);

  const max = Math.max(1, Math.min(maxQuantity, 99));

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantity" value={quantity} />

      <div className="flex items-center gap-3">
        <div className="flex h-12 items-center rounded-lg border border-line">
          <button
            type="button"
            aria-label="Scade cantitatea"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-full w-11 cursor-pointer items-center justify-center text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center text-sm font-medium tabular-nums">
            {quantity}
          </span>
          <button
            type="button"
            aria-label="Creste cantitatea"
            disabled={quantity >= max}
            onClick={() => setQuantity((q) => Math.min(max, q + 1))}
            className="flex h-full w-11 cursor-pointer items-center justify-center text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <Button type="submit" size="lg" disabled={disabled || pending} className="flex-1">
          <ShoppingBag className="size-5" strokeWidth={1.75} />
          {pending ? "Se adauga…" : disabled ? "Stoc epuizat" : "Adauga in cos"}
        </Button>
      </div>

      {state?.message && (
        <p
          role="status"
          className={state.ok ? "text-sm text-positive" : "text-sm text-critical"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
