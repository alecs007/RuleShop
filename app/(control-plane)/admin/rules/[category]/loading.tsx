import { Skeleton } from "@/components/ui/skeleton";

/** Categorie de reguli: versiune activă, setări, listă de reguli, istoric. */
export default function RuleSetLoading() {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-40 rounded-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      <Skeleton className="mt-4 h-4 w-80 max-w-full" />

      {/* „În magazin acum" */}
      <div className="mt-4 space-y-2 rounded-xl border border-line bg-surface-raised p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>

      {/* Setări ruleset */}
      <Skeleton className="mt-4 h-16 rounded-xl" />

      {/* Lista de reguli */}
      <div className="mt-8 flex items-center justify-between">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="mt-3 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-raised p-4"
          >
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-full max-w-lg" />
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Tester + istoric */}
      <Skeleton className="mt-10 h-6 w-48" />
      <Skeleton className="mt-3 h-20 rounded-xl" />
      <Skeleton className="mt-10 h-6 w-40" />
      <Skeleton className="mt-3 h-40 rounded-xl" />
    </div>
  );
}
