// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

const replace = vi.fn();
let currentParams = new URLSearchParams();

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/cart",
  useSearchParams: () => currentParams,
}));

const { ActionForm } = await import("@/components/ui/action-form");
const { FlashToast } = await import("@/components/ui/flash-toast");

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  toast.info.mockClear();
  replace.mockClear();
  currentParams = new URLSearchParams();
});

afterEach(cleanup);

describe("ActionForm", () => {
  it("confirma cu toast dupa ce actiunea reuseste", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(
      <ActionForm action={action} success="Gata.">
        <button>Trimite</button>
      </ActionForm>,
    );

    await userEvent.setup().click(screen.getByRole("button"));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(toast.success).toHaveBeenCalledWith("Gata.");
  });

  it("raporteaza eroarea in loc sa o inghita", async () => {
    const action = vi.fn().mockRejectedValue(new Error("boom"));
    render(
      <ActionForm action={action} success="Gata." error="A eșuat.">
        <button>Trimite</button>
      </ActionForm>,
    );

    await userEvent.setup().click(screen.getByRole("button"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A eșuat."));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("nu executa actiunea daca utilizatorul anuleaza confirmarea", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ActionForm action={action} confirm="Sigur?" success="Gata.">
        <button>Șterge</button>
      </ActionForm>,
    );

    await userEvent.setup().click(screen.getByRole("button"));

    expect(action).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("FlashToast", () => {
  it("transforma cheia din URL in toast si curata parametrul", async () => {
    currentParams = new URLSearchParams("flash=cart-item-removed&page=2");
    render(<FlashToast />);

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith("Produs șters din coș.", {
        id: "cart-item-removed",
        description: undefined,
      }),
    );
    expect(replace).toHaveBeenCalledWith("/cart?page=2", { scroll: false });
  });

  it("ignora o cheie necunoscuta", async () => {
    currentParams = new URLSearchParams("flash=<script>");
    render(<FlashToast />);

    await waitFor(() => expect(replace).not.toHaveBeenCalled());
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
