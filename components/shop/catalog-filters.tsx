"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const SORT_LABELS: Record<string, string> = {
  newest: "Cele mai noi",
  "price-asc": "Preț crescător",
  "price-desc": "Preț descrescător",
  name: "Alfabetic",
};

/** Filtre de catalog pe query params — sharable prin URL, back/forward corect. */
export function CatalogFilters({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page"); // filtrele reseteaza paginarea
    router.push(`${pathname}${next.size ? `?${next}` : ""}`);
  };

  const activeCategory = searchParams.get("category");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setParam("category", null)}
          className={cn(
            "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            !activeCategory
              ? "border-ink bg-ink text-white"
              : "border-line bg-surface-raised text-ink-muted hover:border-ink-faint",
          )}
        >
          Toate
        </button>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() =>
              setParam("category", category === activeCategory ? null : category)
            }
            className={cn(
              "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm capitalize transition-colors",
              category === activeCategory
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface-raised text-ink-muted hover:border-ink-faint",
            )}
          >
            {category}
          </button>
        ))}
      </div>

      <select
        value={searchParams.get("sort") ?? "newest"}
        onChange={(e) => setParam("sort", e.target.value === "newest" ? null : e.target.value)}
        aria-label="Sortează"
        className="ml-auto h-9 cursor-pointer rounded-lg border border-line bg-surface-raised px-3 text-sm outline-none transition-colors focus:border-accent"
      >
        {Object.entries(SORT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </div>
  );
}
