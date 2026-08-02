"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { startRouteLoading } from "@/components/ui/route-loading";
import { storeHref } from "@/lib/shop/routing";

export function SearchBar({ prefix }: { prefix: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <form
      role="search"
      className="relative mx-auto w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q");
        const params = new URLSearchParams();
        if (typeof q === "string" && q.trim()) params.set("q", q.trim());
        const href = storeHref(prefix, `/products${params.size ? `?${params}` : ""}`);
        startRouteLoading(href);
        router.push(href);
      }}
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
        strokeWidth={1.75}
      />
      <input
        type="search"
        name="q"
        defaultValue={searchParams.get("q") ?? ""}
        placeholder="Caută produse…"
        aria-label="Caută produse"
        className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent focus:bg-surface-raised"
      />
    </form>
  );
}
