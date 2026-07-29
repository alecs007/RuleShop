import { Skeleton } from "@/components/ui/skeleton";

/** Homepage: hero + categorii + grilă de noutăți. */
export default function HomeLoading() {
  return (
    <div className="py-8 sm:py-12">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface-raised px-6 py-14 sm:py-20">
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-5 w-80 max-w-full" />
        <Skeleton className="mt-4 h-12 w-40 rounded-lg" />
      </div>

      <Skeleton className="mt-12 h-6 w-28" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>

      <div className="mt-12 flex items-baseline justify-between">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-line bg-surface-raised"
          >
            <Skeleton className="aspect-square rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
