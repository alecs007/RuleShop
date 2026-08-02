/**
 * The catalog filter contract, shared between the products page (server) and
 * the filter panel (client). All state lives in query params, so any filter
 * combination is shareable by URL and works with back/forward.
 */

export const SORT_OPTIONS = [
  { value: "newest", label: "Cele mai noi" },
  { value: "oldest", label: "Cele mai vechi" },
  { value: "price-asc", label: "Preț crescător" },
  { value: "price-desc", label: "Preț descrescător" },
  { value: "name", label: "Nume (A–Z)" },
  { value: "name-desc", label: "Nume (Z–A)" },
] as const;

export type CatalogSort = (typeof SORT_OPTIONS)[number]["value"];

export const DEFAULT_SORT: CatalogSort = "newest";

const SORT_VALUES = SORT_OPTIONS.map((o) => o.value) as readonly string[];

export function isCatalogSort(value: unknown): value is CatalogSort {
  return typeof value === "string" && SORT_VALUES.includes(value);
}

/** The normalized filter selection. Price bounds are in major currency units. */
export interface CatalogSelection {
  q: string;
  categories: string[];
  brands: string[];
  tags: string[];
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  newOnly: boolean;
  sort: CatalogSort;
  page: number;
}

export const NEW_ARRIVAL_DAYS = 30;

export const EMPTY_SELECTION: CatalogSelection = {
  q: "",
  categories: [],
  brands: [],
  tags: [],
  minPrice: null,
  maxPrice: null,
  inStockOnly: false,
  newOnly: false,
  sort: DEFAULT_SORT,
  page: 1,
};

type RawParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

/** Accepts both `?tag=a&tag=b` and `?tag=a,b`. */
function readList(params: RawParams, key: string): string[] {
  const raw =
    params instanceof URLSearchParams
      ? params.getAll(key)
      : toArray(params[key]);

  const seen = new Set<string>();
  for (const entry of raw) {
    for (const value of entry.split(",")) {
      const trimmed = value.trim();
      if (trimmed) seen.add(trimmed);
    }
  }
  return [...seen];
}

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function readOne(params: RawParams, key: string): string | undefined {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  if (value === null || value === undefined) return undefined;
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function readAmount(params: RawParams, key: string): number | null {
  const raw = readOne(params, key);
  if (raw === undefined) return null;
  const value = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

export function parseCatalogSelection(params: RawParams): CatalogSelection {
  const sort = readOne(params, "sort");
  const page = Number.parseInt(readOne(params, "page") ?? "1", 10);

  let minPrice = readAmount(params, "min");
  let maxPrice = readAmount(params, "max");
  // Reorder an inverted range instead of returning zero products.
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  return {
    q: readOne(params, "q") ?? "",
    categories: readList(params, "category"),
    brands: readList(params, "brand"),
    tags: readList(params, "tag"),
    minPrice,
    maxPrice,
    inStockOnly: readOne(params, "stock") === "1",
    newOnly: readOne(params, "new") === "1",
    sort: isCatalogSort(sort) ? sort : DEFAULT_SORT,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Only what differs from the default state reaches the URL. */
export function catalogSearchParams(
  selection: CatalogSelection,
): URLSearchParams {
  const params = new URLSearchParams();
  if (selection.q) params.set("q", selection.q);
  if (selection.categories.length)
    params.set("category", selection.categories.join(","));
  if (selection.brands.length) params.set("brand", selection.brands.join(","));
  if (selection.tags.length) params.set("tag", selection.tags.join(","));
  if (selection.minPrice !== null) params.set("min", String(selection.minPrice));
  if (selection.maxPrice !== null) params.set("max", String(selection.maxPrice));
  if (selection.inStockOnly) params.set("stock", "1");
  if (selection.newOnly) params.set("new", "1");
  if (selection.sort !== DEFAULT_SORT) params.set("sort", selection.sort);
  if (selection.page > 1) params.set("page", String(selection.page));
  return params;
}

export function catalogHref(
  selection: CatalogSelection,
  basePath = "/products",
): string {
  const params = catalogSearchParams(selection);
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

export function countActiveFilters(selection: CatalogSelection): number {
  return (
    selection.categories.length +
    selection.brands.length +
    selection.tags.length +
    (selection.minPrice !== null || selection.maxPrice !== null ? 1 : 0) +
    (selection.inStockOnly ? 1 : 0) +
    (selection.newOnly ? 1 : 0)
  );
}

export function hasActiveFilters(selection: CatalogSelection): boolean {
  return countActiveFilters(selection) > 0 || selection.q !== "";
}

export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}
