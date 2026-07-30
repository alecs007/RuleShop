// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Ce trebuie sa demonstreze: interfata coșului răspunde INAINTE de server.
 * Server action-urile sunt inlocuite cu promisiuni pe care testul le rezolva
 * cand vrea — intre clic si rezolvare, ecranul trebuie sa arate deja rezultatul.
 */

const setQuantity = vi.fn();
const removeItem = vi.fn();
const selectMethod = vi.fn();

vi.mock("@/app/(shop)/cart/actions", () => ({
  setQuantityAction: (data: FormData) => setQuantity(data),
  removeItemAction: (data: FormData) => removeItem(data),
  selectShippingMethodAction: (data: FormData) => selectMethod(data),
}));

const toastInfo = vi.fn();
vi.mock("sonner", () => ({ toast: { info: toastInfo } }));

const { CartView } = await import("@/components/shop/cart-view");
type CartViewProps = Parameters<typeof CartView>[0];
type CartLineView = CartViewProps["lines"][number];

/** Server action care nu se termina pana nu vrea testul. */
function pending() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const ARIA: CartLineView = {
  productId: "p1",
  slug: "casti-aria",
  name: "Căști Aria",
  unitCents: 10_000,
  discountPercent: 0,
  quantity: 2,
  maxPerOrder: 5,
  available: true,
};

const WAVE: CartLineView = {
  productId: "p2",
  slug: "boxa-wave",
  name: "Boxă Wave",
  unitCents: 5_000,
  discountPercent: 0,
  quantity: 1,
  maxPerOrder: 5,
  available: true,
};

const OPTIONS: CartViewProps["shippingOptions"] = [
  {
    id: "standard",
    label: "Standard",
    etaDaysMin: 2,
    etaDaysMax: 4,
    costCents: 1_990,
    baseCostCents: 1_990,
    free: false,
  },
  {
    id: "express",
    label: "Express",
    etaDaysMin: 1,
    etaDaysMax: 1,
    costCents: 3_990,
    baseCostCents: 3_990,
    free: false,
  },
];

function renderCart(overrides: Partial<CartViewProps> = {}) {
  return render(
    <CartView
      lines={[ARIA, WAVE]}
      currency="RON"
      shippingOptions={OPTIONS}
      selectedMethodId="standard"
      {...overrides}
    />,
  );
}

/** Linia de sumar cu eticheta data (Subtotal / Livrare / Total). */
function summary(label: RegExp): string {
  const aside = screen.getByRole("complementary");
  const row = within(aside)
    .getByText(label)
    .closest("div") as HTMLElement;
  return row.textContent ?? "";
}

function line(name: string): HTMLElement {
  return screen.getByRole("link", { name }).closest("li") as HTMLElement;
}

beforeEach(() => {
  setQuantity.mockReset();
  removeItem.mockReset();
  selectMethod.mockReset();
  toastInfo.mockReset();
});

afterEach(cleanup);

describe("CartView", () => {
  it("creste cantitatea si subtotalul inainte ca serverul sa raspunda", async () => {
    const action = pending();
    setQuantity.mockReturnValue(action.promise);
    const user = userEvent.setup();
    renderCart();

    expect(summary(/Subtotal/)).toContain("250,00");

    await user.click(
      within(line("Căști Aria")).getByRole("button", {
        name: "Crește cantitatea",
      }),
    );

    // Serverul e inca in aer: valorile de pe ecran sunt cele optimiste.
    expect(setQuantity).toHaveBeenCalledTimes(1);
    expect(within(line("Căști Aria")).getByText("3")).toBeTruthy();
    expect(summary(/Subtotal/)).toContain("350,00");
    expect(summary(/Subtotal/)).toContain("4 produse");
    expect(summary(/^Total$/)).toContain("369,90");

    action.release();
  });

  it("trimite cantitatea cumulata la clicuri rapide succesive", async () => {
    setQuantity.mockReturnValue(pending().promise);
    const user = userEvent.setup();
    renderCart();

    const plus = within(line("Boxă Wave")).getByRole("button", {
      name: "Crește cantitatea",
    });
    await user.click(plus);
    await user.click(plus);

    expect(setQuantity).toHaveBeenCalledTimes(2);
    const sent = setQuantity.mock.calls.map((call) =>
      (call[0] as FormData).get("quantity"),
    );
    expect(sent).toEqual(["2", "3"]);
    expect(within(line("Boxă Wave")).getByText("3")).toBeTruthy();
  });

  it("nu trece peste plafonul per comanda", async () => {
    setQuantity.mockReturnValue(pending().promise);
    const user = userEvent.setup();
    renderCart({
      lines: [{ ...ARIA, quantity: 5, maxPerOrder: 5 }],
    });

    const plus = screen.getByRole("button", { name: "Crește cantitatea" });
    expect((plus as HTMLButtonElement).disabled).toBe(true);
    await user.click(plus);
    expect(setQuantity).not.toHaveBeenCalled();
  });

  it("scade la 1 si apoi scoate linia din coș", async () => {
    setQuantity.mockReturnValue(pending().promise);
    const user = userEvent.setup();
    renderCart();

    const minus = within(line("Boxă Wave")).getByRole("button", {
      name: "Scade cantitatea",
    });
    await user.click(minus);

    expect((setQuantity.mock.calls[0]![0] as FormData).get("quantity")).toBe("0");
    expect(screen.queryByRole("link", { name: "Boxă Wave" })).toBeNull();
    expect(summary(/Subtotal/)).toContain("200,00");
  });

  it("sterge linia imediat si confirma cu un toast", async () => {
    const action = pending();
    removeItem.mockReturnValue(action.promise);
    const user = userEvent.setup();
    renderCart();

    await user.click(
      within(line("Căști Aria")).getByRole("button", { name: "Șterge din coș" }),
    );

    expect(screen.queryByRole("link", { name: "Căști Aria" })).toBeNull();
    expect(summary(/Subtotal/)).toContain("50,00");
    // Confirmarea vine abia dupa ce serverul a sters efectiv.
    expect(toastInfo).not.toHaveBeenCalled();
    action.release();
  });

  it("arata coșul gol cand ultima linie a fost stearsa optimist", async () => {
    removeItem.mockReturnValue(pending().promise);
    const user = userEvent.setup();
    renderCart({ lines: [ARIA] });

    await user.click(screen.getByRole("button", { name: "Șterge din coș" }));

    expect(screen.getByText("Coșul tău este gol")).toBeTruthy();
  });

  it("muta selectia si costul livrarii pe metoda apasata, fara sa astepte serverul", async () => {
    const action = pending();
    selectMethod.mockReturnValue(action.promise);
    const user = userEvent.setup();
    renderCart();

    expect(summary(/Livrare/)).toContain("19,90");

    const express = screen.getByRole("button", { name: /Express/ });
    await user.click(express);

    expect(express.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByRole("button", { name: /Standard/ }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(summary(/Livrare/)).toContain("39,90");
    expect(summary(/^Total$/)).toContain("289,90");
    expect((selectMethod.mock.calls[0]![0] as FormData).get("methodId")).toBe(
      "express",
    );

    action.release();
  });

  it("blocheaza checkout-ul cat timp o linie e indisponibila", () => {
    renderCart({
      lines: [{ ...ARIA, available: false, unavailableMessage: "Stoc epuizat" }],
    });

    expect(screen.queryByRole("link", { name: /Continuă spre checkout/ })).toBeNull();
    expect(screen.getByText("Stoc epuizat")).toBeTruthy();
  });

  it("nu lasa clientul sa schimbe metoda impusa de o regula", () => {
    renderCart({ methodForced: true });
    const express = screen.getByRole("button", { name: /Express/ });
    expect((express as HTMLButtonElement).disabled).toBe(true);
  });
});
