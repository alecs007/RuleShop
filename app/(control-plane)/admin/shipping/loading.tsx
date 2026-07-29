import { Skeleton } from "@/components/ui/skeleton";

/** Livrare: titlu + tabelul de metode. */
export default function AdminShippingLoading() {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface-raised">
        <div className="border-b border-line px-4 py-3">
          <Skeleton className="h-3 w-full max-w-lg" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-9 flex-1 rounded-lg" />
              <Skeleton className="h-9 w-40 rounded-lg" />
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="mt-6 h-10 w-40 rounded-lg" />
    </div>
  );
}
