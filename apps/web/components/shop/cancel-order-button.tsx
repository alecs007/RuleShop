"use client";

import { useActionState, useEffect, useRef } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import {
  cancelOrderAction,
  type CancelOrderState,
} from "@/app/(shop)/orders/actions";

/**
 * Anularea comenzii de catre client, cu confirmare — o acțiune ireversibila nu
 * se declanseaza dintr-un singur clic. Rezultatul vine prin toast; statusul din
 * pagina se reimprospateaza singur (server action + revalidate).
 */
export function CancelOrderButton({ orderNumber }: { orderNumber: string }) {
  const [state, formAction, pending] = useActionState<
    CancelOrderState | undefined,
    FormData
  >(cancelOrderAction, undefined);

  const lastState = useRef<CancelOrderState | undefined>(undefined);
  useEffect(() => {
    if (!state || state === lastState.current) return;
    lastState.current = state;
    if (state.ok) toast.success(state.message ?? "Comanda a fost anulată.");
    else toast.error(state.message ?? "Comanda nu a putut fi anulată.");
  }, [state]);

  return (
    <form
      action={(formData) => {
        if (
          !window.confirm(
            "Anulezi comanda? Produsele revin în stoc și acțiunea nu poate fi reluată.",
          )
        ) {
          return;
        }
        formAction(formData);
      }}
    >
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <button
        disabled={pending}
        className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-5 text-sm font-medium text-critical transition-colors hover:border-critical hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Spinner className="size-4" />
        ) : (
          <Ban className="size-4" strokeWidth={1.75} />
        )}
        {pending ? "Se anulează…" : "Anulează comanda"}
      </button>
    </form>
  );
}
