import { Skeleton } from "@/components/ui/skeleton";

/** Pagină de produs: breadcrumb, galerie, detalii, buton de adăugare. */
export default function ProductLoading() {
  return (
    <div className="py-8">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Skeleton className="aspect-square rounded-2xl" />

        <div>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-2 h-9 w-4/5" />
          <Skeleton className="mt-4 h-8 w-40" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="mt-6 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="mt-8 flex gap-3">
            <Skeleton className="h-12 w-32 rounded-lg" />
            <Skeleton className="h-12 flex-1 rounded-lg" />
          </div>
          <div className="mt-8 space-y-3 border-t border-line pt-6">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-56" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
