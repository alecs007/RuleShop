"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  reviewIncidentAction,
  type ReviewState,
} from "@/app/(control-plane)/admin/fraud/actions";

const STATUS_OPTIONS = [
  { value: "CONFIRMED_FRAUD", label: "Fraudă confirmată" },
  { value: "FALSE_POSITIVE", label: "Alarmă falsă" },
  { value: "DISMISSED", label: "Fără acțiune" },
] as const;

/**
 * Human review of an incident. When it holds an order awaiting review, the
 * operator decides that order's fate too.
 */
export function IncidentReview({
  incidentId,
  hasPendingOrder,
}: {
  incidentId: string;
  hasPendingOrder: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ReviewState | undefined,
    FormData
  >(reviewIncidentAction, undefined);
  const [status, setStatus] = useState<string>(
    hasPendingOrder ? "CONFIRMED_FRAUD" : "DISMISSED",
  );

  if (state?.ok) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-positive">
        <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.75} />
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="incidentId" value={incidentId} />

      <div className="flex flex-wrap items-center gap-2">
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Clasificare"
          className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:border-accent"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {hasPendingOrder && (
          <select
            name="orderOutcome"
            defaultValue={status === "CONFIRMED_FRAUD" ? "reject" : "approve"}
            key={status}
            aria-label="Ce se întâmplă cu comanda"
            className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:border-accent"
          >
            <option value="approve">Confirmă comanda</option>
            <option value="reject">Respinge comanda</option>
            <option value="none">Lasă comanda neschimbată</option>
          </select>
        )}

        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Spinner className="size-3.5" />}
          {pending ? "Se salvează…" : "Salvează"}
        </Button>
      </div>

      <input
        name="notes"
        placeholder="Notă pentru istoric (opțional)"
        className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors focus:border-accent"
      />

      {state && !state.ok && state.message && (
        <p className="flex items-center gap-1.5 text-sm text-critical">
          <AlertCircle className="size-4 shrink-0" strokeWidth={1.75} />
          {state.message}
        </p>
      )}
    </form>
  );
}
