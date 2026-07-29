import { Skeleton } from "@/components/ui/skeleton";

/** Coș: listă de produse + sumar comandă. */
export default function CartLoading() {
  return (
    <div className="py-8">
      <Skeleton className="h-8 w-40" />

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="divide-y divide-line rounded-xl border border-line bg-surface-raised">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-4 p-4">
              <Skeleton className="size-20 shrink-0 rounded-lg sm:size-24" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-4 h-9 w-32 rounded-lg" />
              </div>
              <Skeleton className="h-5 w-24 shrink-0" />
            </div>
          ))}
        </div>

        <div className="h-fit space-y-3 rounded-xl border border-line bg-surface-raised p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-4 h-5 w-full" />
          <Skeleton className="mt-2 h-12 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
