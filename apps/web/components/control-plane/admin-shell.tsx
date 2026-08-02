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
 * The control plane frame. From `lg` up the sidebar is fixed beside the
 * content; on smaller screens it opens over it and closes on navigation,
 * Escape or a click on the backdrop.
 *
 * The store switcher lives in the header, visible at any width. One control
 * only, so two lists cannot show different states; the sidebar merely says
 * which store you are working on.
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
  /** PLATFORM_ADMIN: sees the store switcher and the Stores page. */
  platformAdmin?: boolean;
  stores?: StoreOption[];
  currentStoreId?: string;
  selectStoreAction?: (formData: FormData) => Promise<StoreSwitchState>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Switching makes sense only for the platform, and only if there is somewhere to go.
  const switchProps =
    platformAdmin && selectStoreAction && currentStoreId && stores.length > 1
      ? { stores, currentStoreId, selectAction: selectStoreAction }
      : null;
  const [open, setOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // A finished navigation, back/forward included, closes the panel.
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
    // While the panel is open, the page underneath does not scroll.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="min-h-screen">
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
        // `invisible` when closed, or the hidden links stay keyboard-reachable.
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-surface-raised transition-transform duration-200 ease-out lg:w-60 lg:translate-x-0 lg:visible",
          open ? "translate-x-0 shadow-xl" : "invisible -translate-x-full",
        )}
      >
        <div className="flex min-h-14 items-center gap-2.5 border-b border-line px-4 py-2 lg:min-h-16">
          <LogoMark alt={storeName} />
          {/* The switcher lives in the header; this only names the store you
              are working on, so there are not two identical controls. */}
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

        {/* A click on any link closes the panel, including one leading to the
            current page, where the route does not change and the effect above
            would never fire. */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          onClick={(event) => {
            if ((event.target as Element).closest("a")) setOpen(false);
          }}
        >
          <AdminNav platformAdmin={platformAdmin} />

          <div className="space-y-1 border-t border-line p-3">
            {/* This goes to the active store, which may differ from the one
                being administered; the title says so, to avoid confusion. */}
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
        {/* The panel header, at any width: the store is switched here without
            opening the menu. It sits in the content column, right of the fixed
            sidebar, so the two never overlap. */}
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
