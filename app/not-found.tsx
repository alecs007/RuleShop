import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <SearchX className="size-10 text-ink-faint" strokeWidth={1.5} />
      <h1 className="mt-4 text-xl font-semibold">Pagina nu există</h1>
      <p className="mt-1 max-w-sm text-ink-muted">
        Adresa este greșită sau conținutul nu mai este disponibil.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
      >
        Înapoi la magazin
      </Link>
    </div>
  );
}
