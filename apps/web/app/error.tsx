"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * The safety net for uncaught errors: a clean message and a retry button
 * instead of a blank screen. The error's own message is not shown, since it
 * may carry internals; the detail stays in the server logs.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <TriangleAlert className="size-10 text-ink-faint" strokeWidth={1.5} />
      <h1 className="mt-4 text-xl font-semibold">A apărut o eroare</h1>
      <p className="mt-1 max-w-sm text-ink-muted">
        Ceva nu a mers cum trebuie. Încearcă din nou — dacă persistă,
        contactează administratorul.
        {error.digest && (
          <span className="mt-1 block text-xs text-ink-faint">
            cod: {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex h-11 cursor-pointer items-center rounded-lg bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
      >
        Încearcă din nou
      </button>
    </div>
  );
}
