import { Skeleton } from "@/components/ui/skeleton";

/** Reguli (privire de ansamblu): grilă de categorii de decizie. */
export default function RulesOverviewLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="mt-2 h-4 w-64 max-w-full" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-line bg-surface-raised p-5"
          >
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
