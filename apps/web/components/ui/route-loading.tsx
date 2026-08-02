"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Spinner } from "./spinner";

/**
 * The loading screen shown while a route changes. App Router exposes no router
 * events, so navigation is detected at the source: a click on an internal
 * link, a GET form submit, or a `router.push` announced through
 * `startRouteLoading`. It goes away once the route commits, where `loading.tsx`
 * takes over with the same spinner.
 *
 * The timing is the point: most routes are prefetched and land in tens of
 * milliseconds, so an immediate overlay would flash exactly when everything is
 * going well. It waits `SHOW_DELAY_MS` before appearing, and once visible stays
 * at least `MIN_VISIBLE_MS`.
 */

/** Below this, navigation feels instant and needs no overlay. */
const SHOW_DELAY_MS = 350;

/** Minimum time on screen once shown, so it cannot flicker. */
const MIN_VISIBLE_MS = 400;

/** Safety net: a cancelled navigation must not leave the screen stuck. */
const FAILSAFE_MS = 8000;

const ROUTE_LOADING_EVENT = "ruleshop:route-loading";

/**
 * For navigations made from code, which the DOM detection cannot see. A
 * destination equal to the current address does nothing, or the screen would
 * wait for a route change that never comes.
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

  // The phases live in refs: they change from timers and DOM handlers, where
  // a state value would always be the stale one.
  const navigating = useRef(false);
  const shownAt = useRef(0);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = (ref: React.RefObject<ReturnType<typeof setTimeout> | null>) => {
    if (ref.current) clearTimeout(ref.current);
    ref.current = null;
  };

  /** The route committed, or the safety net expired. */
  const finish = useCallback(() => {
    navigating.current = false;
    clearTimer(showTimer);
    clearTimer(failsafeTimer);

    // Fast navigation: the overlay never even appeared.
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

  // A route change means the navigation is over.
  useEffect(() => {
    finish();
  }, [pathname, searchParams, finish]);

  useEffect(() => {
    const isSamePlace = (url: URL) =>
      url.pathname === location.pathname && url.search === location.search;

    const onClick = (event: MouseEvent) => {
      // Modified clicks open tabs; already-handled clicks are not ours.
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
      // Another origin, an in-page anchor, or the current page: no navigation.
      if (url.origin !== location.origin || isSamePlace(url)) return;

      start();
    };

    /**
     * Only forms that actually change the address. React renders server action
     * forms with `method="POST"` and they stay put, so treating them as
     * navigation would light the screen up on every admin button.
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

  // Timers must not outlive the component.
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
