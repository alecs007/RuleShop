import Link from "next/link";
import { ShoppingBag } from "lucide-react";

/** Coșul gol — aceeași stare pe server (coș inexistent) și în client (după ce ultima linie a fost ștearsă optimist). */
export function EmptyCart() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <ShoppingBag className="size-10 text-ink-faint" strokeWidth={1.5} />
      <h1 className="mt-4 text-xl font-semibold">Coșul tău este gol</h1>
      <p className="mt-1 text-ink-muted">
        Produsele adăugate rămân salvate, chiar și fără cont.
      </p>
      <Link
        href="/products"
        className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
      >
        Vezi produsele
      </Link>
    </div>
  );
}
