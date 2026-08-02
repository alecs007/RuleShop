import Link from "next/link";
import type { Store } from "@prisma/client";
import { ShoppingBag } from "lucide-react";
import { getSessionUser } from "@/lib/auth/guards";
import { isStaff } from "@/lib/auth/roles";
import { storeHref } from "@/lib/shop/routing";
import { getCartCount } from "@/lib/shop/cart";
import { getCategories } from "@/lib/shop/products";
import { Logo } from "./logo";
import { SearchBar } from "./search-bar";
import { AccountMenu } from "./account-menu";

export async function Header({ store }: { store: Store }) {
  const prefix = store.pathPrefix;
  const [user, cartCount, categories] = await Promise.all([
    getSessionUser(),
    getCartCount(store.id),
    getCategories(store.id),
  ]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-raised/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Logo name={store.name} href={storeHref(prefix)} />

        <div className="flex-1">
          <SearchBar prefix={prefix} />
        </div>

        <nav className="flex items-center gap-1 sm:gap-2">
          <AccountMenu
            prefix={prefix}
            user={
              user
                ? {
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    isStaff: isStaff(user.role),
                  }
                : null
            }
          />
          <Link
            href={storeHref(prefix, "/cart")}
            className="relative flex size-10 items-center justify-center rounded-lg text-ink transition-colors hover:bg-zinc-100"
            aria-label={`Coș de cumpărături, ${cartCount} produse`}
          >
            <ShoppingBag className="size-5" strokeWidth={1.75} />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </Link>
        </nav>
      </div>

      {/* Category navigation, hidden on mobile where the filters cover it */}
      {categories.length > 0 && (
        <div className="hidden border-t border-line sm:block">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-6 py-2.5 text-sm text-ink-muted">
            <Link href={storeHref(prefix, "/products")} className="shrink-0 transition-colors hover:text-ink">
              Toate produsele
            </Link>
            {categories.map((category) => (
              <Link
                key={category}
                href={storeHref(prefix, `/products?category=${encodeURIComponent(category)}`)}
                className="shrink-0 capitalize transition-colors hover:text-ink"
              >
                {category}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
