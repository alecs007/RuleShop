"use client";

import { useActionState, useEffect, useRef } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { addToCartAction, type CartActionState } from "@/app/(shop)/cart/actions";

export function AddToCartButton({
  productId,
  productName,
  maxQuantity,
  disabled,
  disabledLabel = "Stoc epuizat",
}: {
  productId: string;
  productName: string;
  maxQuantity: number;
  disabled?: boolean;
  /** Motivul indisponibilitatii (poate veni dintr-o regula, nu doar din stoc). */
  disabledLabel?: string;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, pending] = useActionState<
    CartActionState | undefined,
    FormData
  >(addToCartAction, undefined);

  const max = Math.max(1, Math.min(maxQuantity, 99));

  // Confirmarea pleacă în toast, nu sub buton: rezultatul se vede și dacă
  // utilizatorul s-a uitat deja în altă parte a paginii.
  const lastState = useRef<CartActionState | undefined>(undefined);
  useEffect(() => {
    if (!state || state === lastState.current) return;
    lastState.current = state;

    if (state.ok) {
      toast.success(`${productName} — adăugat în coș`, {
        description: `Cantitate: ${quantity}`,
        action: { label: "Vezi coșul", onClick: () => router.push("/cart") },
      });
    } else {
      toast.error(state.message ?? "Produsul nu a putut fi adăugat.");
    }
    // `quantity` e citit doar ca detaliu al mesajului, nu declanșează toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, productName, router]);

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
            aria-label="Crește cantitatea"
            disabled={quantity >= max}
            onClick={() => setQuantity((q) => Math.min(max, q + 1))}
            className="flex h-full w-11 cursor-pointer items-center justify-center text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <Button type="submit" size="lg" disabled={disabled || pending} className="flex-1">
          {pending ? (
            <Spinner className="size-5" />
          ) : (
            <ShoppingBag className="size-5" strokeWidth={1.75} />
          )}
          {pending ? "Se adaugă…" : disabled ? disabledLabel : "Adaugă în coș"}
        </Button>
      </div>
    </form>
  );
}
