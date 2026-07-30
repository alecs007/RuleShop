// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Comutatorul de magazin, din perspectiva administratorului: apare in header la
 * orice lățime, arata toate magazinele pornite si nu confirma o comutare pe care
 * serverul a refuzat-o.
 */

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
const refresh = vi.fn();

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  usePathname: () => "/admin",
}));

const { AdminShell } = await import("@/components/control-plane/admin-shell");

const STORES = [
  { id: "ro", name: "RuleShop RO", slug: "ruleshop-ro", active: true },
  { id: "de", name: "RuleShop DE", slug: "ruleshop-de", active: true },
];

function renderShell({
  selectStoreAction = vi.fn().mockResolvedValue({ ok: true, message: "Administrezi „RuleShop DE”." }),
  stores = STORES,
  currentStoreId = "ro",
  platformAdmin = true,
}: {
  selectStoreAction?: ReturnType<typeof vi.fn>;
  stores?: typeof STORES;
  currentStoreId?: string;
  platformAdmin?: boolean;
} = {}) {
  render(
    <AdminShell
      storeName="RuleShop RO"
      userLabel="admin@ruleshop.dev · PLATFORM_ADMIN"
      signOutAction={vi.fn()}
      platformAdmin={platformAdmin}
      stores={stores}
      currentStoreId={currentStoreId}
      selectStoreAction={selectStoreAction}
    >
      <p>conținut</p>
    </AdminShell>,
  );
  return { selectStoreAction };
}

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  refresh.mockClear();
});

afterEach(cleanup);

describe("comutatorul de magazin din header", () => {
  it("arata toate magazinele, cu cel administrat selectat", () => {
    renderShell();

    const select = screen.getByRole("combobox", { name: "Magazinul administrat" });
    expect(
      Array.from(select.querySelectorAll("option")).map((option) => option.textContent),
    ).toEqual(["RuleShop RO (ruleshop-ro)", "RuleShop DE (ruleshop-de)"]);
    expect((select as HTMLSelectElement).value).toBe("ro");
  });

  it("trimite magazinul ales la server și reîmprospătează panoul", async () => {
    const { selectStoreAction } = renderShell();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Magazinul administrat" }),
      "de",
    );

    await waitFor(() => expect(selectStoreAction).toHaveBeenCalledTimes(1));
    const sent = selectStoreAction.mock.calls[0]?.[0] as FormData;
    expect(sent.get("storeId")).toBe("de");
    // Fara refresh, rutele deja prefetch-uite ar rămâne pe magazinul vechi.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Administrezi „RuleShop DE”.");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("nu confirma o comutare refuzata de server", async () => {
    const selectStoreAction = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "Magazinul este oprit." });
    renderShell({ selectStoreAction });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Magazinul administrat" }),
      "de",
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Magazinul este oprit."));
    expect(toast.success).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("nu comuta pe magazinul deja administrat", async () => {
    const { selectStoreAction } = renderShell();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Magazinul administrat" }),
      "ro",
    );

    expect(selectStoreAction).not.toHaveBeenCalled();
  });

  it("nu arata comutator personalului unui magazin", () => {
    renderShell({ platformAdmin: false });

    expect(screen.queryByRole("combobox")).toBeNull();
    // In locul lui, headerul spune pe ce magazin lucrezi.
    expect(screen.getByText(/RuleShop RO · Panou de control/)).toBeTruthy();
  });

  it("nu arata comutator cand exista un singur magazin", () => {
    renderShell({ stores: STORES.slice(0, 1) });

    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
