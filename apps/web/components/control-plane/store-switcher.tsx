"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

export interface StoreOption {
  id: string;
  name: string;
  slug: string;
  /** A stopped store only appears if it is the one being administered. */
  active: boolean;
}

export interface StoreSwitchState {
  ok: boolean;
  message?: string;
}

/**
 * Switches the administered store, not what customers see — that is the active
 * store, changed separately from /admin/stores.
 *
 * The selection goes to the server in a transition, so the page refreshes in
 * place. The server answers with the outcome: if the store was stopped or
 * deleted meanwhile, the panel stays put and says why instead of confirming a
 * switch that did not happen.
 */
export function StoreSwitcher({
  stores,
  currentStoreId,
  selectAction,
  className,
  label = "Magazinul administrat",
}: {
  stores: StoreOption[];
  currentStoreId: string;
  selectAction: (formData: FormData) => Promise<StoreSwitchState>;
  className?: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <select
        value={currentStoreId}
        disabled={pending}
        onChange={(event) => {
          const storeId = event.target.value;
          if (storeId === currentStoreId) return;

          const data = new FormData();
          data.set("storeId", storeId);
          startTransition(async () => {
            const state = await selectAction(data);
            if (state.ok) {
              // Prefetched routes sit in the router cache with the old
              // store's data; `refresh` brings them all to the new one.
              router.refresh();
              toast.success(state.message ?? "Magazin comutat.");
            } else {
              toast.error(state.message ?? "Comutarea nu a reușit.");
            }
          });
        }}
        className="w-full cursor-pointer appearance-none truncate rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-8 text-sm font-semibold transition-colors hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-progress"
      >
        {stores.map((store) => (
          // A stopped store is listed only to show what you are working on;
          // the server refuses to switch to it anyway.
          <option
            key={store.id}
            value={store.id}
            disabled={!store.active && store.id !== currentStoreId}
          >
            {store.name} ({store.slug}){!store.active && " · oprit"}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint"
      >
        {pending ? (
          <Spinner className="size-3.5" />
        ) : (
          <ChevronsUpDown className="size-3.5" strokeWidth={1.75} />
        )}
      </span>
    </label>
  );
}
