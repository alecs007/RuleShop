import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

const WIDE_LOGO = "/images/wide-logo.svg";
const SQUARE_LOGO = "/images/square-logo.svg";

/** The square mark, without a link: sidebar, avatars, favicon-like uses. */
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

/** Wide wordmark on large screens, square mark on mobile. */
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
