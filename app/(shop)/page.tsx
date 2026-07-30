import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { getActiveStore } from "@/lib/shop/store";
import { getCategories, getFeaturedProducts } from "@/lib/shop/products";
import { getPriceViews } from "@/lib/shop/pricing";
import { ProductCard } from "@/components/shop/product-card";

export default async function HomePage() {
  const store = await getActiveStore();
  const [products, categories] = await Promise.all([
    getFeaturedProducts(store.id, 8),
    getCategories(store.id),
  ]);
  const prices = await getPriceViews(products);

  return (
    <div className="appear-content py-8 sm:py-12">
      <section className="relative overflow-hidden rounded-2xl border border-line bg-surface-raised px-6 py-14 flex flex-col items-center text-center sm:px-12 sm:py-20">
        {/* Left Side Image */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-30 sm:opacity-50"
          style={{
            maskImage:
              "linear-gradient(to right, black 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, black 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
          }}
        >
          <Image
            src="/images/hero-cover.svg"
            alt=""
            fill
            priority
            className="object-cover object-left"
          />
        </div>

        {/* Right Side Image */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/3 opacity-30 sm:opacity-50"
          style={{
            maskImage:
              "linear-gradient(to left, black 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to left, black 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
          }}
        >
          <Image
            src="/images/hero-cover.svg"
            alt=""
            fill
            priority
            className="object-cover object-right"
          />
        </div>

        {/* Center Content */}
        <div className="relative z-10 flex flex-col items-center">
          <Image
            src="/images/wide-logo.svg"
            alt={store.name}
            width={1600}
            height={332}
            priority
            className="mx-auto h-12 w-auto sm:h-16"
          />
          <p className="mx-auto mt-4 max-w-xl text-balance text-ink-muted sm:text-lg">
            Produse alese, prețuri corecte, livrare rapidă.
          </p>
          <Link
            href="/products"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-ink px-6 font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Vezi catalogul <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* Categorii */}
      {categories.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">Categorii</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((category) => (
              <Link
                key={category}
                href={`/products?category=${encodeURIComponent(category)}`}
                className="rounded-xl border border-line bg-surface-raised px-4 py-5 text-center text-sm font-medium capitalize transition-all hover:border-ink-faint hover:shadow-subtle"
              >
                {category}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Produse recente */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Noutăți</h2>
          <Link
            href="/products"
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Vezi toate
          </Link>
        </div>
        {products.length === 0 ? (
          <p className="mt-6 text-ink-muted">
            Catalogul este gol. Rulează{" "}
            <code className="font-mono">npm run db:seed</code> pentru datele
            demo.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                price={prices.get(product.id)!}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
