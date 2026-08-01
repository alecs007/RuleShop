"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Store, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Logo, LogoMark } from "@/components/shop/logo";
import { AdminNav } from "./admin-nav";
import {
  StoreSwitcher,
  type StoreOption,
  type StoreSwitchState,
} from "./store-switcher";

/**
 * Cadrul control plane-ului.
 *
 * De la `lg` in sus sidebar-ul e fix, langa continut. Pe ecrane mici nu ocupa
 * permanent din latime: se deschide ca panou peste continut, dintr-un buton din
 * headerul mobil, si se inchide la navigare, la Escape sau la clic pe fundal.
 *
 * Comutatorul de magazin sta in header — vizibil la orice latime, si pe telefon
 * fara sa deschizi meniul. Un singur control, ca sa nu existe doua liste care
 * pot arata stari diferite; sidebar-ul doar scrie pe ce magazin lucrezi.
 */
export function AdminShell({
  storeName,
  userLabel,
  signOutAction,
  platformAdmin = false,
  stores = [],
  currentStoreId,
  selectStoreAction,
  children,
}: {
  storeName: string;
  userLabel: string;
  signOutAction: () => Promise<void>;
  /** PLATFORM_ADMIN: vede comutatorul de magazin si pagina Magazine. */
  platformAdmin?: boolean;
  stores?: StoreOption[];
  currentStoreId?: string;
  selectStoreAction?: (formData: FormData) => Promise<StoreSwitchState>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Comutarea are sens doar pentru platforma si doar daca exista unde sa comuti.
  const switchProps =
    platformAdmin && selectStoreAction && currentStoreId && stores.length > 1
      ? { stores, currentStoreId, selectAction: selectStoreAction }
      : null;
  const [open, setOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Navigarea incheiata (inclusiv back/forward) inchide panoul.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        openButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    // Cat timp panoul e deschis, pagina de dedesubt nu se deruleaza.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="min-h-screen">
      {/* Fundalul panoului */}
      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-ink/40 lg:hidden"
        />
      )}

      <aside
        id="admin-sidebar"
        // `invisible` cand e inchis: altfel linkurile ascunse ar rămâne
        // accesibile din tastatura pe telefon.
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-surface-raised transition-transform duration-200 ease-out lg:w-60 lg:translate-x-0 lg:visible",
          open ? "translate-x-0 shadow-xl" : "invisible -translate-x-full",
        )}
      >
        <div className="flex min-h-14 items-center gap-2.5 border-b border-line px-4 py-2 lg:min-h-16">
          <LogoMark alt={storeName} />
          {/* Comutatorul sta in header, unde se vede la orice lățime; aici doar
              scrie pe ce magazin lucrezi, ca sa nu existe doua controale identice. */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{storeName}</p>
            <p className="text-xs text-ink-faint">
              {switchProps ? "Magazinul administrat" : "Panou de control"}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Închide meniul"
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-zinc-100 hover:text-ink lg:hidden"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Un clic pe orice link inchide panoul — si cand duce la pagina curenta,
            caz in care ruta nu se schimba si efectul de mai sus nu s-ar declansa. */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          onClick={(event) => {
            if ((event.target as Element).closest("a")) setOpen(false);
          }}
        >
          <AdminNav platformAdmin={platformAdmin} />

          <div className="space-y-1 border-t border-line p-3">
            {/* Duce la magazinul ACTIV, care poate fi altul decat cel administrat:
                pentru platforma spunem asta in text, ca sa nu para o eroare. */}
            <Link
              href="/"
              title={
                platformAdmin
                  ? "Deschide magazinul pe care îl văd clienții"
                  : undefined
              }
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink"
            >
              <Store className="size-5 shrink-0" strokeWidth={1.75} />
              {platformAdmin ? "Vezi magazinul activ" : "Vezi magazinul"}
            </Link>
            <form action={signOutAction}>
              <button className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-critical transition-colors hover:bg-red-50">
                <LogOut className="size-5 shrink-0" strokeWidth={1.75} />
                Deconectare
              </button>
            </form>
            <p className="truncate px-3 pb-1 text-xs text-ink-faint">
              {userLabel}
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:ml-60">
        {/* Header-ul panoului, la orice lățime: aici se comută magazinul
            administrat, fără să deschizi meniul. Stă în coloana de conținut, la
            dreapta sidebar-ului fix, deci nu se suprapun. */}
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-line bg-surface-raised px-3 sm:px-8 lg:h-16">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
            <button
              ref={openButtonRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Deschide meniul"
              aria-expanded={open}
              aria-controls="admin-sidebar"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink lg:hidden"
            >
              <Menu className="size-5" strokeWidth={1.75} />
            </button>
            <Logo className="size-7 shrink-0 lg:hidden" />

            {switchProps ? (
              <>
                <span className="hidden shrink-0 text-xs text-ink-faint sm:inline">
                  Administrezi
                </span>
                <StoreSwitcher {...switchProps} className="min-w-0 flex-1 sm:max-w-xs" />
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm text-ink-faint">
                {storeName} · Panou de control
              </span>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
