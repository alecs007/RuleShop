"use client";

import { useActionState } from "react";
import { AlertCircle, Bot } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  classifyIncidentAction,
  type AiActionState,
} from "@/app/(control-plane)/admin/rules/ai-actions";

const CLASS_LABELS: Record<string, { label: string; className: string }> = {
  PROBABIL_FRAUDA: { label: "probabil fraudă", className: "text-critical" },
  PROBABIL_LEGITIM: { label: "probabil legitim", className: "text-positive" },
  DATE_INSUFICIENTE: { label: "date insuficiente", className: "text-ink-muted" },
};

/**
 * The AI's opinion on an incident, shown beside the review form. The decision
 * stays with the operator.
 */
export function AiIncidentOpinion({
  incidentId,
  classification,
  confidence,
  rationale,
  aiConfigured,
}: {
  incidentId: string;
  classification: string | null;
  confidence: number | null;
  rationale: string | null;
  aiConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    AiActionState | undefined,
    FormData
  >(classifyIncidentAction, undefined);

  if (classification) {
    const info = CLASS_LABELS[classification] ?? {
      label: classification,
      className: "text-ink-muted",
    };
    return (
      <div className="flex items-start gap-2 text-sm">
        <Bot className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
        <p className="text-ink-muted">
          <span className="font-medium text-ink">Opinie AI:</span>{" "}
          <span className={`font-medium ${info.className}`}>{info.label}</span>
          {typeof confidence === "number" &&
            ` (încredere ${Math.round(confidence * 100)}%)`}
          {rationale && <> — {rationale}</>}
        </p>
      </div>
    );
  }

  if (!aiConfigured) return null;

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="incidentId" value={incidentId} />
        <button
          disabled={pending}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Spinner className="size-3.5" /> : <Bot className="size-3.5" strokeWidth={1.75} />}
          {pending ? "Analizează…" : "Cere opinia AI"}
        </button>
      </form>
      {state && !state.ok && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-critical">
          <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
          {state.message}
        </p>
      )}
    </div>
  );
}
