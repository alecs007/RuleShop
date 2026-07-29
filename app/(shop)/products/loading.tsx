import { Skeleton } from "@/components/ui/skeleton";

/** Catalog: titlu, filtre pe categorii, sortare, grilă de produse. */
export default function CatalogLoading() {
  return (
    <div className="py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-20" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
        <Skeleton className="ml-auto h-9 w-40 rounded-lg" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => (
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
