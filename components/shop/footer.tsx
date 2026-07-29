import Link from "next/link";

export function Footer({ storeName = "RuleShop" }: { storeName?: string }) {
  return (
    <footer className="mt-16 border-t border-line bg-surface-raised">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <p className="text-sm font-semibold">{storeName}</p>
          <p className="mt-2 max-w-xs text-sm text-ink-muted">
            Magazin online întreținut de un rule engine configurabil.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">Magazin</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            <li>
              <Link href="/products" className="hover:text-ink">
                Toate produsele
              </Link>
            </li>
            <li>
              <Link href="/cart" className="hover:text-ink">
                Cosul meu
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Cont</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            <li>
              <Link href="/account" className="hover:text-ink">
                Contul meu
              </Link>
            </li>
            <li>
              <Link href="/account/orders" className="hover:text-ink">
                Comenzile mele
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Ajutor</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            <li>
              <span>Livrare si retururi</span>
            </li>
            <li>
              <span>Contact</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-ink-faint sm:px-6">
          © {new Date().getFullYear()} {storeName}. Plati simulate — mediu
          demonstrativ.
        </p>
      </div>
    </footer>
  );
}
