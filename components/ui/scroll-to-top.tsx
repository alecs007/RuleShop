"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Duce pagina în capăt la fiecare schimbare de adresă.
 *
 * Next face asta singur, dar nu de încredere aici: `template.tsx` animează
 * conținutul cu un `transform`, iar euristica lui („e deja vizibil vârful
 * paginii?") citește poziția deplasată de animație și sare peste derulare. Un
 * efect explicit e mai simplu de urmărit decât să ne luptăm cu euristica.
 *
 * Două excepții, amândouă anunțate din cod prin `skipNextScrollReset()`:
 *  - back/forward, unde browserul restaurează poziția — a duce utilizatorul în
 *    capăt când se întoarce într-o listă lungă ar fi o regresie;
 *  - navigările care schimbă doar query string-ul ca stare de UI, nu ca pagină
 *    nouă (testerul de preț, curățarea parametrului `flash`).
 */

let skipNext = false;

/** Sări peste următoarea readucere în capăt (navigare care nu e „pagină nouă"). */
export function skipNextScrollReset() {
  skipNext = true;
}

export function ScrollToTop() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Back/forward: lăsăm restaurarea browserului. `popstate` ajunge înaintea
  // re-randării, deci steagul e pus la timp.
  useEffect(() => {
    const onPopState = () => skipNextScrollReset();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (skipNext) {
      skipNext = false;
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, searchParams]);

  return null;
}
