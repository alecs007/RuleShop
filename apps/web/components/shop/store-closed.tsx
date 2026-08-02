import { Logo } from "./logo";

/**
 * A store stopped from the panel. Stopping one is a normal state, not an
 * error, and every store can be stopped at once. No header or footer here:
 * both would need data from a store that is not being served.
 */
export function StoreClosed({ storeName }: { storeName: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-6 text-center">
      <Logo name={storeName} />
      <div className="max-w-md">
        <h1 className="text-xl font-semibold">Magazinul este momentan închis</h1>
        <p className="mt-2 text-ink-muted">
          {storeName} nu acceptă comenzi în acest moment. Revino mai târziu.
        </p>
      </div>
    </div>
  );
}
