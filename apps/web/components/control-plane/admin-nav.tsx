"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Scale,
  ShieldAlert,
  ShoppingCart,
  Store,
  Truck,
  Users,
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
  { href: "/admin/orders", label: "Comenzi", icon: ShoppingCart },
  { href: "/admin/customers", label: "Clienți", icon: Users },
  { href: "/admin/products", label: "Produse", icon: Package },
  { href: "/admin/rules", label: "Reguli", icon: Scale },
  { href: "/admin/shipping", label: "Livrare", icon: Truck },
  { href: "/admin/fraud", label: "Antifraudă", icon: ShieldAlert },
];

/** Platform entries, not store ones: PLATFORM_ADMIN only. */
const PLATFORM_NAV: NavItem[] = [
  { href: "/admin/stores", label: "Magazine", icon: Store },
];

/** The same entries in the desktop sidebar and the mobile panel. */
export function AdminNav({ platformAdmin = false }: { platformAdmin?: boolean }) {
  const pathname = usePathname();
  const items = platformAdmin ? [...NAV, ...PLATFORM_NAV] : NAV;

  return (
    <nav className="flex-1 space-y-1 p-3">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-zinc-100 text-ink"
                : "text-ink-muted hover:bg-zinc-100 hover:text-ink",
            )}
          >
            <Icon className="size-5 shrink-0" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
