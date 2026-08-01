// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

let currentPathname = "/products";
let currentParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
  useSearchParams: () => currentParams,
}));

const { RouteLoading, startRouteLoading } = await import(
  "@/components/ui/route-loading"
);

/** Overlay-ul e singurul `role="status"` randat de componenta. */
const overlay = () => screen.queryByRole("status");

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Simuleaza comiterea rutei: se schimba adresa, deci componenta se re-randeaza. */
function commitRoute(rerender: (ui: React.ReactElement) => void, pathname: string) {
  currentPathname = pathname;
  history.replaceState({}, "", pathname);
  act(() => {
    rerender(<RouteLoading />);
  });
}

function clickLink(href: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = "link";
  // jsdom nu poate naviga: opresc acțiunea implicită la țintă. Handlerul
  // componentei e pe document în faza de capture, deci vede clicul înainte.
  anchor.addEventListener("click", (e) => e.preventDefault());
  document.body.appendChild(anchor);
  act(() => {
    anchor.click();
  });
  return anchor;
}

function submitForm(method?: string) {
  const form = document.createElement("form");
  if (method) form.setAttribute("method", method);
  form.addEventListener("submit", (e) => e.preventDefault());
  document.body.appendChild(form);
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  return form;
}

beforeEach(() => {
  vi.useFakeTimers();
  currentPathname = "/products";
  currentParams = new URLSearchParams();
  // Componenta compara destinatia cu `location`, deci adresa reala din jsdom
  // trebuie sa fie aceeasi cu cea raportata de `usePathname`.
  history.replaceState({}, "", currentPathname);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("RouteLoading", () => {
  it("nu apare la o navigare rapida", () => {
    const { rerender } = render(<RouteLoading />);

    clickLink("/cart");
    advance(200); // ruta vine inainte de pragul de afisare
    commitRoute(rerender, "/cart");
    advance(2000);

    expect(overlay()).toBeNull();
  });

  it("apare doar cand navigarea trece de prag", () => {
    const { rerender } = render(<RouteLoading />);

    clickLink("/cart");
    advance(340);
    expect(overlay()).toBeNull();

    advance(20);
    expect(overlay()).not.toBeNull();

    commitRoute(rerender, "/cart");
    // Rămâne puțin pe ecran ca să nu clipească…
    expect(overlay()).not.toBeNull();
    advance(500);
    expect(overlay()).toBeNull();
  });

  it("ignora formularele cu server action (POST) — nu sunt navigari", () => {
    render(<RouteLoading />);

    submitForm("POST");
    advance(2000);

    expect(overlay()).toBeNull();
  });

  it("trateaza formularele GET ca navigare", () => {
    render(<RouteLoading />);

    submitForm(); // fara method = GET
    advance(400);

    expect(overlay()).not.toBeNull();
  });

  it("ignora clicul pe adresa curenta si pe alt domeniu", () => {
    render(<RouteLoading />);

    clickLink("/products");
    clickLink("https://example.com/altundeva");
    advance(2000);

    expect(overlay()).toBeNull();
  });

  it("ignora clicul cu tasta modificatoare (tab nou)", () => {
    render(<RouteLoading />);

    const anchor = document.createElement("a");
    anchor.href = "/cart";
    anchor.addEventListener("click", (e) => e.preventDefault());
    document.body.appendChild(anchor);
    act(() => {
      anchor.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }),
      );
    });
    advance(2000);

    expect(overlay()).toBeNull();
  });

  it("navigarile din cod se anunta prin startRouteLoading", () => {
    render(<RouteLoading />);

    act(() => {
      startRouteLoading("/products?category=audio");
    });
    advance(400);

    expect(overlay()).not.toBeNull();
  });

  it("startRouteLoading nu porneste nimic pentru adresa curenta", () => {
    render(<RouteLoading />);

    act(() => {
      startRouteLoading("/products");
    });
    advance(2000);

    expect(overlay()).toBeNull();
  });

  it("plasa de siguranta stinge overlay-ul daca ruta nu se mai comite", () => {
    render(<RouteLoading />);

    clickLink("/cart");
    advance(400);
    expect(overlay()).not.toBeNull();

    advance(8000 + 500);
    expect(overlay()).toBeNull();
  });
});
