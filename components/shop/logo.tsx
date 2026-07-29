import Link from "next/link";

/**
 * Logo-ul magazinului. Deocamdata wordmark; cand exista un logo grafic,
 * inlocuieste span-ul cu <Image src={store.themeDefaults.logoUrl} .../> —
 * tema (inclusiv logo-ul) va putea fi controlata de regulile THEME.
 */
export function Logo({ name = "RuleShop" }: { name?: string }) {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight"
    >
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white"
      >
        {name.charAt(0)}
      </span>
      <span className="hidden sm:inline">{name}</span>
    </Link>
  );
}
