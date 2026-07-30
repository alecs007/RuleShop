"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Scale,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/products", label: "Produse", icon: Package },
  { href: "/admin/rules", label: "Reguli", icon: Scale },
  { href: "/admin/shipping", label: "Livrare", icon: Truck },
];

/**
 * Navigatia control plane-ului. Pe ecrane mici rămâne o bandă de iconuri, deci
 * pagina curenta se marcheaza vizual (si prin aria-current) — altfel, fara
 * etichete, nu s-ar vedea unde te afli.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 p-2 lg:p-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center justify-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors lg:justify-start lg:px-3",
              active
                ? "bg-zinc-100 text-ink"
                : "text-ink-muted hover:bg-zinc-100 hover:text-ink",
            )}
          >
            <Icon className="size-5 shrink-0" strokeWidth={1.75} />
            <span className="hidden lg:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
