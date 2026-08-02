"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  verifyChallengeAction,
  type CheckoutState,
} from "@/app/(shop)/[store]/checkout/actions";
import { StorePrefixField } from "./store-prefix-field";

/**
 * The verification step a CHALLENGE decision asks for. In this demo the code
 * is shown on the page; a real system would send it by email or SMS.
 */
export function ChallengeForm({
  prefix,
  orderNumber,
  demoCode,
}: {
  prefix: string | null;
  orderNumber: string;
  demoCode: string;
}) {
  const [state, formAction, pending] = useActionState<
    CheckoutState | undefined,
    FormData
  >(verifyChallengeAction, undefined);

  if (state?.ok) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
        <CheckCircle2 className="size-5 shrink-0 text-positive" strokeWidth={1.75} />
        <p className="font-medium text-positive">
          Comandă confirmată. Îți mulțumim!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2.5">
        <ShieldQuestion className="mt-0.5 size-5 shrink-0 text-caution" strokeWidth={1.75} />
        <div>
          <p className="font-medium text-caution">
            Verificare suplimentară necesară
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Verificarea antifraudă a cerut confirmarea comenzii. Introdu codul de
            mai jos pentru a o finaliza.
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-ink-muted">
        Cod de test (mediu demonstrativ):{" "}
        <span className="font-mono font-semibold tracking-widest text-ink">
          {demoCode}
        </span>
      </p>

      <form action={formAction} className="mt-3 flex flex-wrap items-start gap-2">
        <StorePrefixField prefix={prefix} />
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <input
          name="code"
          required
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          aria-label="Cod de verificare"
          className="h-10 w-32 rounded-lg border border-line bg-surface-raised px-3 font-mono tracking-widest outline-none transition-colors focus:border-accent"
        />
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Se verifică…" : "Confirmă comanda"}
        </Button>
      </form>

      {state && !state.ok && state.message && (
        <p
          role="alert"
          className="mt-2 flex items-center gap-1.5 text-sm text-critical"
        >
          <AlertCircle className="size-4 shrink-0" strokeWidth={1.75} />
          {state.message}
        </p>
      )}
    </div>
  );
}
