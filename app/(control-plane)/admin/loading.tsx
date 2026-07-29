import { Skeleton } from "@/components/ui/skeleton";

/** Dashboard: titlu + patru carduri de statistici. */
export default function DashboardLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-line bg-surface-raised p-5"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
