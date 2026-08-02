"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Scrolls to the top on every address change. Next does this itself, but not
 * reliably here: `template.tsx` animates the content with a `transform`, and
 * Next's "is the top already visible?" heuristic reads the shifted position
 * and skips the scroll.
 *
 * Two exceptions, both announced from code through `skipNextScrollReset()`:
 * back/forward, where the browser restores the position, and navigations that
 * only change the query string as UI state rather than as a new page.
 */

let skipNext = false;

/** Skip the next scroll reset, for a navigation that is not a new page. */
export function skipNextScrollReset() {
  skipNext = true;
}

export function ScrollToTop() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Leave back/forward to the browser. `popstate` arrives before the
  // re-render, so the flag is set in time.
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
