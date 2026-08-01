"use client";

import { useActionState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PublishState } from "@/app/(control-plane)/admin/rules/actions";

type PublishFn = (
  prev: PublishState | undefined,
  formData: FormData,
) => Promise<PublishState>;

export function PublishButton({
  action,
  nextVersion,
}: {
  action: PublishFn;
  nextVersion: number;
}) {
  const [state, formAction, pending] = useActionState<PublishState | undefined, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : <Rocket className="size-4" strokeWidth={1.75} />}
        {pending ? "Se publică…" : `Publică v${nextVersion}`}
      </Button>
      <AnimatePresence>
        {state?.message && (
          <motion.p
            role="status"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={
              state.ok
                ? "flex items-center gap-1.5 text-sm text-positive"
                : "flex items-center gap-1.5 text-sm text-critical"
            }
          >
            {state.ok ? (
              <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.75} />
            ) : (
              <AlertCircle className="size-4 shrink-0" strokeWidth={1.75} />
            )}
            {state.message}
          </motion.p>
        )}
      </AnimatePresence>
      {state?.issues && state.issues.length > 0 && (
        <ul className="max-w-sm space-y-1 rounded-lg bg-red-50 p-3 text-xs text-critical">
          {state.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
