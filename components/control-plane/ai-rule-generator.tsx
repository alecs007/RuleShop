"use client";

import { useActionState } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { AiActionState } from "@/app/(control-plane)/admin/rules/ai-actions";

/**
 * „Descrie regula în cuvinte": cerinta in limbaj natural -> regula structurata
 * generata de IA, salvata ca DRAFT si deschisa in editor pentru verificare.
 * La succes actiunea redirectioneaza spre editor; aici raman doar erorile.
 */
export function AiRuleGenerator({
  action,
}: {
  action: (
    prev: AiActionState | undefined,
    formData: FormData,
  ) => Promise<AiActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Sparkles className="size-4.5 text-accent" strokeWidth={1.75} />
        Descrie regula în cuvinte
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        AI-ul o transformă într-o regulă structurată, salvată ca draft — o
        verifici în editor și tot tu o publici.
      </p>

      <form action={formAction} className="mt-3">
        <textarea
          name="request"
          rows={2}
          required
          minLength={10}
          maxLength={1000}
          placeholder="Ex: clienții VIP primesc 15% reducere la produsele din categoria audio"
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-faint">
            Regula generată nu se aplică până nu o publici tu.
          </p>
          <button
            disabled={pending}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium transition-colors hover:border-ink-faint disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Spinner className="size-4" /> : <Sparkles className="size-4" strokeWidth={1.75} />}
            {pending ? "Generează…" : "Generează regula"}
          </button>
        </div>
      </form>

      {state && !state.ok && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-critical" strokeWidth={1.75} />
          <div>
            <p className="text-critical">{state.message}</p>
            {state.issues && state.issues.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-xs text-ink-muted">
                {state.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
