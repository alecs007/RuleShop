"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { formatMoney } from "@/lib/utils/money";

export interface ProductOption {
  id: string;
  name: string;
  sku: string;
  priceCents: number;
  currency: string;
  imageUrl: string | null;
}

/**
 * Cautare de produs cu autocomplete pentru testerul de pret.
 * Alegerea unui produs pune ?test=<id> in URL — evaluarea ramane pe server.
 */
export function ProductSearch({
  products,
  selectedId,
}: {
  products: ProductOption[];
  selectedId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  const selected = products.find((p) => p.id === selectedId) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const normalized = query.trim().toLowerCase();
  const results = normalized
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(normalized) ||
          p.sku.toLowerCase().includes(normalized),
      )
    : products;

  const pick = (id: string) => {
    setOpen(false);
    setQuery("");
    router.push(`${pathname}?test=${id}`, { scroll: false });
  };

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          strokeWidth={1.75}
        />
        <input
          type="text"
          value={open ? query : (selected?.name ?? query)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Caută un produs după nume sau SKU…"
          aria-label="Caută un produs"
          className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-9 text-sm outline-none transition-colors focus:border-accent focus:bg-surface-raised"
        />
        {selected && !open && (
          <button
            type="button"
            aria-label="Renunță la produsul selectat"
            onClick={() => router.push(pathname, { scroll: false })}
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-zinc-100 hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-80 w-full overflow-y-auto rounded-xl border border-line bg-surface-raised p-1.5 shadow-subtle"
        >
          {results.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-ink-muted">
              Niciun produs găsit pentru „{query}”.
            </li>
          )}
          {results.slice(0, 8).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === selectedId}
                onClick={() => pick(p.id)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-100"
              >
                <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-zinc-100">
                  {p.imageUrl && (
                    <Image src={p.imageUrl} alt="" fill sizes="36px" className="object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-ink-faint">{p.sku}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                  {formatMoney(p.priceCents, p.currency)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
