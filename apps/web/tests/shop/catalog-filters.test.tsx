// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CatalogFacets } from "@/lib/shop/products";

const push = vi.fn();
let currentParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/products",
  useSearchParams: () => currentParams,
}));

vi.mock("@/components/ui/route-loading", () => ({
  startRouteLoading: vi.fn(),
}));

const { CatalogFilters } = await import("@/components/shop/catalog-filters");

const FACETS: CatalogFacets = {
  categories: [
    { value: "audio", count: 4 },
    { value: "telefoane", count: 3 },
  ],
  brands: [{ value: "Vertex", count: 2 }],
  tags: [{ value: "wireless", count: 3 }],
  minPrice: 99,
  maxPrice: 5499,
  inStockCount: 15,
  newCount: 12,
  total: 17,
};

beforeEach(() => {
  push.mockClear();
  currentParams = new URLSearchParams();
});

afterEach(cleanup);

async function openPanel() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Filtre/ }));
  return { user, dialog: screen.getByRole("dialog") };
}

describe("CatalogFilters", () => {
  it("nu arata panoul pana la apasarea butonului", () => {
    render(<CatalogFilters facets={FACETS} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("panoul e foaie de jos pe mobil si panou pe stanga pe ecrane mari", async () => {
    render(<CatalogFilters facets={FACETS} />);
    const { dialog } = await openPanel();

    // Mobil: ancorat jos, inaltime plafonata, deci pagina rămâne vizibilă sus.
    expect(dialog.className).toContain("max-h-[85svh]");
    expect(dialog.className).toContain("rounded-t-2xl");
    // Peste `sm`: coloana din stanga, cu chenar la dreapta.
    expect(dialog.className).toContain("sm:border-r");
    expect(dialog.parentElement?.className).toContain("sm:justify-start");
    expect(dialog.parentElement?.className).toContain("items-end");
  });

  it("randeaza panoul in body, ca sa acopere tot ecranul", async () => {
    const { container } = render(<CatalogFilters facets={FACETS} />);
    const { dialog } = await openPanel();

    // Portal: învelișul e copil direct al lui `body`, nu al componentei. Altfel
    // un strămoș cu `transform` (animația de intrare a paginii) ar deveni
    // containing block si fundalul ar acoperi doar cutia conținutului.
    const root = dialog.parentElement!;
    expect(root.parentElement).toBe(document.body);
    expect(container.contains(dialog)).toBe(false);
    expect(root.className).toContain("fixed");
    expect(root.className).toContain("inset-0");
  });

  it("ofera toate grupele de filtre", async () => {
    render(<CatalogFilters facets={FACETS} />);
    const { dialog } = await openPanel();

    for (const title of [
      "Sortare",
      "Categorii",
      "Brand",
      "Preț",
      "Disponibilitate",
      "Etichete",
    ]) {
      expect(within(dialog).getByRole("heading", { name: title })).toBeTruthy();
    }
  });

  it("comite filtrele bifate abia la Aplică", async () => {
    render(<CatalogFilters facets={FACETS} />);
    const { user, dialog } = await openPanel();

    await user.click(within(dialog).getByRole("checkbox", { name: /audio/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Vertex/ }));
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Doar produse în stoc/ }),
    );
    expect(push).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Aplică filtrele" }));
    expect(push).toHaveBeenCalledWith(
      "/products?category=audio&brand=Vertex&stock=1",
    );
  });

  it("presetele de preț se aplica ca interval", async () => {
    render(<CatalogFilters facets={FACETS} />);
    const { user, dialog } = await openPanel();

    const preset = within(dialog).getAllByRole("button", { name: /lei/ })[0]!;
    await user.click(preset);
    await user.click(within(dialog).getByRole("button", { name: "Aplică filtrele" }));

    const href = push.mock.calls[0]![0] as string;
    expect(href).toMatch(/max=\d+/);
  });

  it("eticheta unui filtru activ il scoate, pastrand restul", async () => {
    currentParams = new URLSearchParams("category=audio,telefoane&stock=1");
    render(<CatalogFilters facets={FACETS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTitle("Elimină filtrul: audio"));

    expect(push).toHaveBeenCalledWith("/products?category=telefoane&stock=1");
  });

  it("Șterge tot pastreaza căutarea si sortarea", async () => {
    currentParams = new URLSearchParams("q=telefon&category=audio&sort=price-asc");
    render(<CatalogFilters facets={FACETS} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Șterge tot" }));

    expect(push).toHaveBeenCalledWith("/products?q=telefon&sort=price-asc");
  });

  it("butonul arata cate filtre sunt active, fara sa numere căutarea", () => {
    currentParams = new URLSearchParams("q=telefon&category=audio&tag=wireless");
    render(<CatalogFilters facets={FACETS} />);

    expect(screen.getByRole("button", { name: /Filtre/ }).textContent).toBe(
      "Filtre2",
    );
  });

  it("schimbarea sortarii navigheaza imediat", async () => {
    render(<CatalogFilters facets={FACETS} />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Sortează"), "price-desc");

    expect(push).toHaveBeenCalledWith("/products?sort=price-desc");
  });
});
