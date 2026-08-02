import { Spinner } from "./spinner";

/**
 * The page loading state, used by every `loading.tsx`. One spinner rather than
 * skeletons on purpose: the loading screen starts on click and must look the
 * same until the content is ready, and a skeleton in between would break that.
 *
 * `delayed-spinner` keeps it invisible for the first few hundred milliseconds.
 * The delay is in CSS, not JS: this is a Suspense boundary, with nowhere to
 * run a timer.
 */
export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="delayed-spinner flex min-h-[60vh] items-center justify-center"
    >
      <Spinner className="size-7 text-ink-muted" />
      <span className="sr-only">Se încarcă…</span>
    </div>
  );
}
