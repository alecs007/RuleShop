import Link from "next/link";
import Image from "next/image";

export function Footer({ storeName = "RuleShop" }: { storeName?: string }) {
  return (
    <footer className="mt-16 border-t border-line bg-surface-raised">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <Image
            src="/images/wide-logo.svg"
            alt={storeName}
            width={1600}
            height={332}
            className="h-7 w-auto"
          />
          <p className="mt-4 max-w-xs text-sm text-ink-muted">
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
                Coșul meu
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
              <Link href="/orders" className="hover:text-ink">
                Comenzile mele
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Ajutor</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            <li>
              <span>Livrare și retururi</span>
            </li>
            <li>
              <span>Contact</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-ink-faint sm:px-6">
          © {new Date().getFullYear()} {storeName}. Toate drepturile
          rezervate.{" "}
        </p>
      </div>
    </footer>
  );
}
