"use client";

import { useActionState, useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import type { AiActionState } from "@/app/(control-plane)/admin/rules/ai-actions";

/**
 * Butonul „Analizează cu IA": porneste analiza pe server si raporteaza
 * rezultatul prin toast. Analiza poate dura cateva secunde — starea de
 * asteptare e vizibila, iar erorile (IA neconfigurata, timeout) ajung la
 * administrator cu mesajul lor real.
 */
export function AiAnalyzeButton({
  action,
}: {
  action: (
    prev: AiActionState | undefined,
    formData: FormData,
  ) => Promise<AiActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  const lastState = useRef<AiActionState | undefined>(undefined);
  useEffect(() => {
    if (!state || state === lastState.current) return;
    lastState.current = state;
    if (state.ok) toast.success(state.message ?? "Analiza s-a încheiat.");
    else toast.error(state.message ?? "Analiza a eșuat.");
  }, [state]);

  return (
    <form action={formAction}>
      <button
        disabled={pending}
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Spinner className="size-4" />
        ) : (
          <Sparkles className="size-4" strokeWidth={1.75} />
        )}
        {pending ? "Analizează…" : "Analizează cu AI"}
      </button>
    </form>
  );
}
