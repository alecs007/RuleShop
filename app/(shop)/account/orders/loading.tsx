import { Skeleton } from "@/components/ui/skeleton";

/** Comenzile mele: listă de comenzi. */
export default function OrdersLoading() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <Skeleton className="h-8 w-48" />

      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-raised p-5"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="space-y-2 text-right">
              <Skeleton className="ml-auto h-5 w-24" />
              <Skeleton className="ml-auto h-5 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
