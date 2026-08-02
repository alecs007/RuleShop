// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

let currentPathname = "/products";
let currentParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
  useSearchParams: () => currentParams,
}));

const { ScrollToTop, skipNextScrollReset } = await import(
  "@/components/ui/scroll-to-top"
);

const scrollTo = vi.fn();

beforeEach(() => {
  currentPathname = "/products";
  currentParams = new URLSearchParams();
  scrollTo.mockClear();
  vi.stubGlobal("scrollTo", scrollTo);
});

afterEach(cleanup);

/** A navigation: the address changes and the component re-renders. */
function navigate(
  rerender: (ui: React.ReactElement) => void,
  pathname: string,
  search = "",
) {
  currentPathname = pathname;
  currentParams = new URLSearchParams(search);
  act(() => {
    rerender(<ScrollToTop />);
  });
}

describe("ScrollToTop", () => {
  it("duce pagina in capat la schimbarea rutei", () => {
    const { rerender } = render(<ScrollToTop />);
    scrollTo.mockClear(); // randarea initiala

    navigate(rerender, "/products/telefon-vertex-9");

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("duce in capat si cand se schimba doar filtrele sau pagina din listă", () => {
    const { rerender } = render(<ScrollToTop />);
    scrollTo.mockClear();

    navigate(rerender, "/products", "category=audio");
    expect(scrollTo).toHaveBeenCalledTimes(1);

    navigate(rerender, "/products", "category=audio&page=2");
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it("nu se mișcă la back/forward — browserul restaureaza poziția", () => {
    const { rerender } = render(<ScrollToTop />);
    scrollTo.mockClear();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    navigate(rerender, "/products/telefon-vertex-9");

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("respecta excepția anunțata din cod, o singura data", () => {
    const { rerender } = render(<ScrollToTop />);
    scrollTo.mockClear();

    act(() => skipNextScrollReset());
    navigate(rerender, "/admin/rules/pricing", "test=abc");
    expect(scrollTo).not.toHaveBeenCalled();

    // The exception is consumed: the next navigation scrolls again.
    navigate(rerender, "/admin/rules/pricing", "test=def");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
