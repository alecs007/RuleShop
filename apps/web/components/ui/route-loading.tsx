"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Spinner } from "./spinner";

/**
 * Ecran de încărcare la schimbarea paginii.
 *
 * App Router nu expune evenimente de router, deci navigarea se detectează la
 * sursă: clic pe un link intern, trimiterea unui formular GET sau un
 * `router.push` anunțat prin `startRouteLoading`. Se stinge când ruta s-a
 * comis — de acolo preia `loading.tsx`, care arată același spinner
 * (`LoadingScreen`), deci utilizatorul vede o singură stare continuă.
 *
 * Cheia e CÂND apare: rutele sunt în mare parte prefetch-uite, așa că cele mai
 * multe navigări se termină în câteva zeci de milisecunde. Un overlay afișat
 * imediat ar clipi degeaba exact atunci când totul merge bine — de aceea
 * așteptăm `SHOW_DELAY_MS` înainte de a-l arăta, iar dacă ruta s-a comis până
 * atunci nu se vede nimic. Odată apărut, rămâne cel puțin `MIN_VISIBLE_MS`, ca
 * să nu pâlpâie.
 */

/** Sub acest prag navigarea se simte instantanee — nu merită overlay. */
const SHOW_DELAY_MS = 350;

/** Cât rămâne minim pe ecran odată apărut (altfel ar clipi). */
const MIN_VISIBLE_MS = 400;

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
  const [visible, setVisible] = useState(false);

  // Fazele navigării trăiesc în ref-uri: se schimbă din timere si din
  // handlere de DOM, unde o valoare de state ar fi mereu cea veche.
  const navigating = useRef(false);
  const shownAt = useRef(0);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = (ref: React.RefObject<ReturnType<typeof setTimeout> | null>) => {
    if (ref.current) clearTimeout(ref.current);
    ref.current = null;
  };

  /** Ruta s-a comis (sau a expirat plasa de siguranță). */
  const finish = useCallback(() => {
    navigating.current = false;
    clearTimer(showTimer);
    clearTimer(failsafeTimer);

    // Navigare rapidă: overlay-ul nici nu a apucat să apară.
    if (shownAt.current === 0) return;

    const elapsed = Date.now() - shownAt.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    shownAt.current = 0;
    clearTimer(hideTimer);
    hideTimer.current = setTimeout(() => setVisible(false), remaining);
  }, []);

  const start = useCallback(() => {
    if (navigating.current) return;
    navigating.current = true;
    clearTimer(hideTimer);

    showTimer.current = setTimeout(() => {
      shownAt.current = Date.now();
      setVisible(true);
    }, SHOW_DELAY_MS);

    failsafeTimer.current = setTimeout(finish, FAILSAFE_MS);
  }, [finish]);

  // Schimbarea rutei = navigarea s-a terminat.
  useEffect(() => {
    finish();
  }, [pathname, searchParams, finish]);

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

      start();
    };

    /**
     * Doar formularele care chiar schimbă adresa. Formularele cu server action
     * sunt randate de React cu `method="POST"` și rămân pe loc — dacă le-am
     * trata ca navigare, orice buton de admin ar aprinde ecranul degeaba.
     */
    const onSubmit = (event: Event) => {
      if (event.defaultPrevented) return;
      const form = event.target as HTMLFormElement | null;
      if (!form || (form.getAttribute("method") ?? "get").toLowerCase() !== "get") {
        return;
      }
      start();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener(ROUTE_LOADING_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener(ROUTE_LOADING_EVENT, start);
    };
  }, [start]);

  // Timerele nu trebuie să supraviețuiască demontării componentei.
  useEffect(
    () => () => {
      clearTimer(showTimer);
      clearTimer(hideTimer);
      clearTimer(failsafeTimer);
    },
    [],
  );

  if (!visible) return null;

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
