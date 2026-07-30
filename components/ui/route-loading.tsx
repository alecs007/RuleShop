"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Spinner } from "./spinner";

/**
 * Ecran de încărcare la schimbarea paginii.
 *
 * App Router nu expune evenimente de router, deci navigarea se detectează la
 * sursă: clic pe un link intern sau trimiterea unui formular GET. Se afișează
 * imediat, fără întârziere, și se stinge când ruta s-a comis — de acolo preia
 * `loading.tsx`, care arată exact același spinner (`LoadingScreen`), astfel
 * încât utilizatorul vede o singură stare continuă până la conținut.
 */

/** Plasă de siguranță: o navigare anulată nu trebuie să lase ecranul blocat. */
const FAILSAFE_MS = 8000;

const ROUTE_LOADING_EVENT = "ruleshop:route-loading";

/**
 * Pornește ecranul de încărcare pentru navigările făcute din cod
 * (`router.push`), pe care detectarea din DOM nu le poate vedea. Dacă
 * destinația e chiar adresa curentă nu se întâmplă nimic — altfel ecranul ar
 * aștepta o schimbare de rută care nu vine.
 */
export function startRouteLoading(href: string) {
  if (typeof window === "undefined") return;
  const url = new URL(href, location.href);
  if (url.pathname === location.pathname && url.search === location.search) return;
  window.dispatchEvent(new Event(ROUTE_LOADING_EVENT));
}

export function RouteLoading() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, setNavigating] = useState(false);

  // Ruta nouă s-a comis.
  useEffect(() => {
    setNavigating(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!navigating) return;
    const failsafe = setTimeout(() => setNavigating(false), FAILSAFE_MS);
    return () => clearTimeout(failsafe);
  }, [navigating]);

  useEffect(() => {
    const isSamePlace = (url: URL) =>
      url.pathname === location.pathname && url.search === location.search;

    const onClick = (event: MouseEvent) => {
      // Clic modificat = taburi noi; clicul deja tratat de altcineva se ignoră.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      if (
        !anchor.getAttribute("href") ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }

      let url: URL;
      try {
        url = new URL((anchor as HTMLAnchorElement).href, location.href);
      } catch {
        return;
      }
      // Alt domeniu, ancoră în pagină sau chiar pagina curentă — nicio navigare.
      if (url.origin !== location.origin || isSamePlace(url)) return;

      setNavigating(true);
    };

    // Formularele GET (căutare, testerul de livrare) schimbă si ele pagina;
    // cele POST sunt server actions si au deja spinner in buton.
    const onSubmit = (event: Event) => {
      if (event.defaultPrevented) return;
      const form = event.target as HTMLFormElement | null;
      if (!form || (form.getAttribute("method") ?? "get").toLowerCase() !== "get") {
        return;
      }
      setNavigating(true);
    };

    const onProgrammaticNavigation = () => setNavigating(true);

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener(ROUTE_LOADING_EVENT, onProgrammaticNavigation);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener(ROUTE_LOADING_EVENT, onProgrammaticNavigation);
    };
  }, []);

  if (!navigating) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-surface/85"
    >
      <Spinner className="size-7 text-ink-muted" />
      <span className="sr-only">Se încarcă…</span>
    </div>
  );
}
