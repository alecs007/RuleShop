import { Skeleton } from "@/components/ui/skeleton";

/** Contul meu: card de profil + statistici de loialitate. */
export default function AccountLoading() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <Skeleton className="h-8 w-40" />

      <div className="mt-6 rounded-xl border border-line bg-surface-raised p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
