import { Skeleton } from "@/components/ui/skeleton";

/** Conținut versiune: antet, diff, setări, lista de reguli înghețate. */
export default function VersionLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-40" />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-56 rounded-lg" />
      </div>

      <Skeleton className="mt-6 h-24 rounded-xl" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>

      <Skeleton className="mt-8 h-6 w-64" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-line bg-surface-raised p-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-32 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
