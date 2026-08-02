"use client";

import { useActionState, useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import type { AiActionState } from "@/app/(control-plane)/admin/rules/ai-actions";

/**
 * Starts the analysis on the server and reports back in a toast. It can take a
 * few seconds, so the pending state is visible and errors reach the admin with
 * their real message.
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
