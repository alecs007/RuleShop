import { Skeleton } from "@/components/ui/skeleton";

/** Produse: căutare + tabel. */
export default function AdminProductsLoading() {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      <Skeleton className="mt-6 h-10 w-full max-w-sm rounded-lg" />

      <div className="mt-4 rounded-xl border border-line bg-surface-raised">
        <div className="border-b border-line px-4 py-3">
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
