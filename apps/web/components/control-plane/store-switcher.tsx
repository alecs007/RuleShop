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
  /** Un magazin oprit apare doar daca e cel administrat acum, si nu se poate alege. */
  active: boolean;
}

export interface StoreSwitchState {
  ok: boolean;
  message?: string;
}

/**
 * Comutatorul de magazin din panou, doar pentru PLATFORM_ADMIN. Acelasi
 * component in sidebar si in header, cu aceeasi lista si aceeasi actiune.
 *
 * Schimba magazinul ADMINISTRAT, nu ce vad clientii: aceia primesc magazinul
 * activ, care se schimba separat din /admin/stores.
 *
 * Selectia pleacă la server într-o tranziție, deci pagina se reînnoiește pe loc,
 * fără ecran de încărcare peste tot panoul. Serverul răspunde cu rezultatul:
 * dacă magazinul a fost oprit sau șters între timp, panoul rămâne pe cel curent
 * și spune de ce, în loc să confirme o comutare care nu s-a întâmplat.
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
              // Panoul intreg ține de magazinul administrat, iar rutele deja
              // prefetch-uite stau în cache-ul de router cu datele vechi:
              // `refresh` le aduce pe toate pe magazinul nou.
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
          // Magazinul oprit e in lista doar ca sa se vada pe ce lucrezi; nu e o
          // destinatie valida, iar serverul refuza oricum comutarea pe el.
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
