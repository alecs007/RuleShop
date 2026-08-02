"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import type { CatalogFacets, FacetOption } from "@/lib/shop/products";
import {
  catalogHref,
  countActiveFilters,
  parseCatalogSelection,
  toggleValue,
  EMPTY_SELECTION,
  NEW_ARRIVAL_DAYS,
  SORT_OPTIONS,
  isCatalogSort,
  type CatalogSelection,
} from "@ruleshop/storefront";
import { cn } from "@/lib/utils/cn";
import { startRouteLoading } from "@/components/ui/route-loading";
import { Button } from "@/components/ui/button";

/**
 * One button that opens a panel with every criterion. The URL is the source of
 * truth: the panel works on a local draft and commits it on "Apply", so a tick
 * does not trigger a navigation of its own.
 */
export function CatalogFilters({ facets }: { facets: CatalogFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const applied = useMemo(
    () => parseCatalogSelection(searchParams),
    [searchParams],
  );
  const activeCount = countActiveFilters(applied);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CatalogSelection>(applied);

  // The panel always starts from what is already applied.
  useEffect(() => {
    if (open) setDraft(applied);
  }, [open, applied]);

  const navigate = useCallback(
    (selection: CatalogSelection) => {
      // Any filter change returns to the first page.
      const href = catalogHref({ ...selection, page: 1 }, pathname);
      startRouteLoading(href);
      router.push(href);
    },
    [pathname, router],
  );

  const apply = () => {
    setOpen(false);
    navigate(draft);
  };

  const clearAll = () => {
    setOpen(false);
    // The header's search is not a panel filter, so it survives.
    navigate({ ...EMPTY_SELECTION, q: applied.q, sort: applied.sort });
  };

  const chips = useMemo(() => activeChips(applied), [applied]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors",
          activeCount > 0
            ? "border-ink bg-ink text-white"
            : "border-line bg-surface-raised text-ink hover:border-ink-faint",
        )}
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.75} />
        Filtre
        {activeCount > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink">
            {activeCount}
          </span>
        )}
      </button>

      {/* Active filters, removable one by one. */}
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => navigate(chip.without)}
          title={`Elimină filtrul: ${chip.label}`}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
        >
          <span className="max-w-40 truncate">{chip.label}</span>
          <X className="size-3.5 shrink-0" strokeWidth={2} />
        </button>
      ))}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="cursor-pointer px-1 text-sm text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Șterge tot
        </button>
      )}

      <div className="relative ml-auto">
        <select
          value={applied.sort}
          onChange={(e) =>
            navigate({
              ...applied,
              sort: isCatalogSort(e.target.value)
                ? e.target.value
                : applied.sort,
            })
          }
          aria-label="Sortează"
          className="h-9 cursor-pointer appearance-none rounded-lg border border-line bg-surface-raised pl-3 pr-9 text-sm outline-none transition-colors focus:border-accent"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          strokeWidth={1.75}
        />
      </div>

      {open && (
        <FilterPanel
          facets={facets}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setOpen(false)}
          onApply={apply}
          onReset={() =>
            setDraft({ ...EMPTY_SELECTION, q: draft.q, sort: draft.sort })
          }
        />
      )}
    </div>
  );
}

function FilterPanel({
  facets,
  draft,
  setDraft,
  onClose,
  onApply,
  onReset,
}: {
  facets: CatalogFacets;
  draft: CatalogSelection;
  setDraft: (next: CatalogSelection) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
}) {
  // Escape closes it; while open the page behind does not scroll.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const draftCount = countActiveFilters(draft);
  const presets = useMemo(
    () => pricePresets(facets.minPrice, facets.maxPrice),
    [facets.minPrice, facets.maxPrice],
  );

  // Rendered into `document.body`: any ancestor with a `transform` would
  // become the containing block for `position: fixed`, and the backdrop would
  // cover only the content box instead of the screen.
  return createPortal(
    // A bottom sheet on mobile, a left-hand panel from `sm` up.
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-start">
      <div
        className="absolute inset-0 bg-ink/30"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-filters-title"
        className="filter-sheet relative flex max-h-[85svh] w-full flex-col rounded-t-2xl border-t border-line bg-surface-raised shadow-subtle sm:h-full sm:max-h-none sm:max-w-sm sm:rounded-none sm:border-r sm:border-t-0"
      >
        {/* Sheet grabber, mobile only */}
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden"
          aria-hidden
        />
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="catalog-filters-title" className="text-base font-semibold">
            Filtre
            {draftCount > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-muted">
                {draftCount} active
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide filtrele"
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-1">
          <Section title="Sortare">
            <div className="grid gap-1.5">
              {SORT_OPTIONS.map((option) => (
                <Option
                  key={option.value}
                  type="radio"
                  label={option.label}
                  checked={draft.sort === option.value}
                  onToggle={() => setDraft({ ...draft, sort: option.value })}
                />
              ))}
            </div>
          </Section>

          {facets.categories.length > 0 && (
            <Section title="Categorii" hint="Se pot bifa mai multe">
              <OptionList
                options={facets.categories}
                selected={draft.categories}
                capitalize
                onToggle={(value) =>
                  setDraft({
                    ...draft,
                    categories: toggleValue(draft.categories, value),
                  })
                }
              />
            </Section>
          )}

          {facets.brands.length > 0 && (
            <Section title="Brand">
              <OptionList
                options={facets.brands}
                selected={draft.brands}
                onToggle={(value) =>
                  setDraft({ ...draft, brands: toggleValue(draft.brands, value) })
                }
              />
            </Section>
          )}

          <Section
            title="Preț"
            hint={
              facets.maxPrice > 0
                ? `În catalog: ${facets.minPrice} – ${facets.maxPrice} lei`
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              <PriceInput
                label="Preț minim"
                placeholder={String(facets.minPrice)}
                value={draft.minPrice}
                onChange={(minPrice) => setDraft({ ...draft, minPrice })}
              />
              <span className="text-ink-faint">–</span>
              <PriceInput
                label="Preț maxim"
                placeholder={String(facets.maxPrice)}
                value={draft.maxPrice}
                onChange={(maxPrice) => setDraft({ ...draft, maxPrice })}
              />
              <span className="text-sm text-ink-muted">lei</span>
            </div>

            {presets.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {presets.map((preset) => {
                  const active =
                    draft.minPrice === preset.min && draft.maxPrice === preset.max;
                  return (
                    <Chip
                      key={preset.label}
                      active={active}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          minPrice: active ? null : preset.min,
                          maxPrice: active ? null : preset.max,
                        })
                      }
                    >
                      {preset.label}
                    </Chip>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Disponibilitate">
            <div className="grid gap-1.5">
              <Option
                type="checkbox"
                label="Doar produse în stoc"
                count={facets.inStockCount}
                checked={draft.inStockOnly}
                onToggle={() =>
                  setDraft({ ...draft, inStockOnly: !draft.inStockOnly })
                }
              />
              <Option
                type="checkbox"
                label={`Doar noutăți (ultimele ${NEW_ARRIVAL_DAYS} de zile)`}
                count={facets.newCount}
                checked={draft.newOnly}
                onToggle={() => setDraft({ ...draft, newOnly: !draft.newOnly })}
              />
            </div>
          </Section>

          {facets.tags.length > 0 && (
            <Section title="Etichete" hint="Produsul are cel puțin una">
              <div className="flex flex-wrap gap-2">
                {facets.tags.map((tag) => (
                  <Chip
                    key={tag.value}
                    active={draft.tags.includes(tag.value)}
                    onClick={() =>
                      setDraft({ ...draft, tags: toggleValue(draft.tags, tag.value) })
                    }
                  >
                    {tag.value}
                    <span className="ml-1 text-xs opacity-60">{tag.count}</span>
                  </Chip>
                ))}
              </div>
            </Section>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-5 py-4">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onReset}
            disabled={draftCount === 0}
          >
            Resetează
          </Button>
          <Button className="flex-1" onClick={onApply}>
            Aplică filtrele
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line py-4 last:border-b-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-ink-faint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function OptionList({
  options,
  selected,
  capitalize,
  onToggle,
}: {
  options: FacetOption[];
  selected: string[];
  capitalize?: boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1">
      {options.map((option) => (
        <Option
          key={option.value}
          type="checkbox"
          label={option.value}
          count={option.count}
          capitalize={capitalize}
          checked={selected.includes(option.value)}
          onToggle={() => onToggle(option.value)}
        />
      ))}
    </div>
  );
}

function Option({
  type,
  label,
  count,
  capitalize,
  checked,
  onToggle,
}: {
  type: "checkbox" | "radio";
  label: string;
  count?: number;
  capitalize?: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm transition-colors hover:bg-zinc-50">
      <input
        type={type}
        checked={checked}
        onChange={onToggle}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "flex size-4.5 shrink-0 items-center justify-center border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
          type === "radio" ? "rounded-full" : "rounded",
          checked ? "border-ink bg-ink text-white" : "border-line bg-surface-raised",
        )}
      >
        {checked &&
          (type === "radio" ? (
            <span className="size-1.5 rounded-full bg-white" />
          ) : (
            <Check className="size-3" strokeWidth={3} />
          ))}
      </span>
      <span className={cn("flex-1 truncate", capitalize && "capitalize")}>
        {label}
      </span>
      {count !== undefined && (
        <span className="shrink-0 text-xs text-ink-faint">{count}</span>
      )}
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-line bg-surface-raised text-ink-muted hover:border-ink-faint hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function PriceInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      aria-label={label}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        const parsed = Number.parseInt(e.target.value, 10);
        onChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : null);
      }}
      className="h-9 w-full min-w-0 rounded-lg border border-line bg-surface-raised px-3 text-sm tabular-nums outline-none transition-colors focus:border-accent"
    />
  );
}

interface ActiveChip {
  key: string;
  label: string;
  /** The same selection, without the filter this chip stands for. */
  without: CatalogSelection;
}

function activeChips(selection: CatalogSelection): ActiveChip[] {
  const chips: ActiveChip[] = [];

  for (const category of selection.categories) {
    chips.push({
      key: `category:${category}`,
      label: category,
      without: {
        ...selection,
        categories: selection.categories.filter((v) => v !== category),
      },
    });
  }
  for (const brand of selection.brands) {
    chips.push({
      key: `brand:${brand}`,
      label: brand,
      without: {
        ...selection,
        brands: selection.brands.filter((v) => v !== brand),
      },
    });
  }
  for (const tag of selection.tags) {
    chips.push({
      key: `tag:${tag}`,
      label: `#${tag}`,
      without: { ...selection, tags: selection.tags.filter((v) => v !== tag) },
    });
  }
  if (selection.minPrice !== null || selection.maxPrice !== null) {
    chips.push({
      key: "price",
      label: priceLabel(selection.minPrice, selection.maxPrice),
      without: { ...selection, minPrice: null, maxPrice: null },
    });
  }
  if (selection.inStockOnly) {
    chips.push({
      key: "stock",
      label: "În stoc",
      without: { ...selection, inStockOnly: false },
    });
  }
  if (selection.newOnly) {
    chips.push({
      key: "new",
      label: "Noutăți",
      without: { ...selection, newOnly: false },
    });
  }

  return chips;
}

function priceLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min} – ${max} lei`;
  if (min !== null) return `peste ${min} lei`;
  return `sub ${max} lei`;
}

/** Round steps for the quick price ranges. */
const NICE_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000];

function pricePresets(min: number, max: number) {
  if (max <= min) return [];
  const raw = (max - min) / 4;
  const step = NICE_STEPS.find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;

  const bounds = [start + step, start + 2 * step, start + 3 * step].filter(
    (b) => b < max,
  );
  if (bounds.length === 0) return [];

  const first = bounds[0]!;
  const last = bounds[bounds.length - 1]!;

  const presets: { label: string; min: number | null; max: number | null }[] = [
    { label: `sub ${first} lei`, min: null, max: first },
  ];
  for (let i = 1; i < bounds.length; i += 1) {
    const lower = bounds[i - 1]!;
    const upper = bounds[i]!;
    presets.push({ label: `${lower} – ${upper} lei`, min: lower, max: upper });
  }
  presets.push({ label: `peste ${last} lei`, min: last, max: null });
  return presets;
}
