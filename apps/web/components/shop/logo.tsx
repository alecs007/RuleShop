import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

const WIDE_LOGO = "/images/wide-logo.svg";
const SQUARE_LOGO = "/images/square-logo.svg";

/** Iconul pătrat (fără link) — pentru sidebar, favicon-like, avatare. */
export function LogoMark({
  className,
  alt = "RuleShop",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <span className={cn("relative block size-8 shrink-0", className)}>
      <Image src={SQUARE_LOGO} alt={alt} fill sizes="64px" priority />
    </span>
  );
}

/**
 * Logo-ul magazinului: wordmark lat pe ecrane mari, iconul pătrat pe mobil.
 * Raportul SVG-urilor: wide 1600×332, square 1254×1254.
 */
export function Logo({
  name = "RuleShop",
  href = "/",
  className,
}: {
  name?: string;
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={name}
      className={cn("flex shrink-0 items-center", className)}
    >
      <Image
        src={WIDE_LOGO}
        alt={name}
        width={1600}
        height={332}
        priority
        className="hidden h-8 w-auto sm:block"
      />
      <LogoMark className="sm:hidden" alt={name} />
    </Link>
  );
}
