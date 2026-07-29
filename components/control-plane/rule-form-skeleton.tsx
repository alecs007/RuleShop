import { Skeleton } from "@/components/ui/skeleton";

/** Editorul de reguli: date generale, condiții, acțiuni, previzualizare. */
export function RuleFormSkeleton() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_280px]">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>

      {/* Condiții */}
      <div className="rounded-xl border border-line bg-surface-raised p-4">
        <Skeleton className="h-4 w-32" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-44 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 min-w-40 flex-1 rounded-lg" />
        </div>
        <Skeleton className="mt-3 h-4 w-40" />
      </div>

      {/* Acțiuni */}
      <div className="rounded-xl border border-line bg-surface-raised p-4">
        <Skeleton className="h-4 w-32" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-56 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
        <Skeleton className="mt-3 h-4 w-36" />
      </div>

      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-5 w-72 max-w-full" />
      <div className="flex items-center gap-3 border-t border-line pt-5">
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}
