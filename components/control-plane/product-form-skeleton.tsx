import { Skeleton } from "@/components/ui/skeleton";

/** Formularul de produs: câmpuri pe două coloane + descriere. */
export function ProductFormSkeleton() {
  const field = (key: number, labelWidth: string) => (
    <div key={key} className="space-y-1.5">
      <Skeleton className={`h-4 ${labelWidth}`} />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        {field(1, "w-14")}
        {field(2, "w-12")}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {field(3, "w-20")}
        {field(4, "w-28")}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {field(5, "w-32")}
        {field(6, "w-12")}
      </div>

      <div className="space-y-1.5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {field(7, "w-36")}
        {field(8, "w-44")}
      </div>

      <Skeleton className="h-5 w-40" />
      <div className="flex items-center gap-3 border-t border-line pt-5">
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}
