import { Spinner } from "./spinner";

/**
 * Starea de încărcare a unei pagini, folosită de toate fișierele `loading.tsx`.
 *
 * Deliberat un singur spinner, nu schelete: ecranul de încărcare porneșe la clic
 * (`components/ui/route-loading.tsx`) și trebuie să arate la fel până când
 * conținutul e gata — un schelet care apare între cele două ar rupe tranziția.
 */
export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] items-center justify-center"
    >
      <Spinner className="size-7 text-ink-muted" />
      <span className="sr-only">Se încarcă…</span>
    </div>
  );
}
