import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Truck, RotateCcw, ShieldCheck } from "lucide-react";
import { getActiveStore } from "@/lib/shop/store";
import { getProductBySlug } from "@/lib/shop/products";
import { getPriceView } from "@/lib/shop/pricing";
import { Price } from "@/components/shop/price";
import { AddToCartButton } from "@/components/shop/add-to-cart-button";
import { Badge } from "@/components/ui/badge";
import { FadeImage } from "@/components/ui/fade-image";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getActiveStore();
  const product = await getProductBySlug(store.id, slug);
  return { title: product?.name ?? "Produs" };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const store = await getActiveStore();
  const product = await getProductBySlug(store.id, slug);
  if (!product || !product.active) notFound();

  const price = await getPriceView(product);
  // TODO(rules): disponibilitatea si plafonul de cantitate vor veni din
  // decizia AVAILABILITY; livrarea estimata din decizia SHIPPING.
  const available = product.stock > 0;
  const image = product.imageUrls[0];

  return (
    // `appear-content`: conținutul preia locul spinnerului cu o tranziție, nu
    // dintr-o bucată (spinnerul e fallback de Suspense, deci învelișul animat
    // din `template.tsx` s-a montat deja înaintea lui).
    <div className="appear-content py-8">
      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-1.5 text-sm text-ink-muted"
        aria-label="Breadcrumb"
      >
        <Link href="/products" className="transition-colors hover:text-ink">
          Produse
        </Link>
        <ChevronRight className="size-3.5" />
        <Link
          href={`/products?category=${encodeURIComponent(product.category)}`}
          className="capitalize transition-colors hover:text-ink"
        >
          {product.category}
        </Link>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Galerie */}
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-zinc-100">
          {image ? (
            <div className="w-full h-full bg-white">
              <FadeImage
                src={image}
                alt={product.name}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-4xl text-ink-faint">
              {product.name.charAt(0)}
            </div>
          )}
        </div>

        {/* Detalii */}
        <div className="flex flex-col">
          <p className="text-sm uppercase tracking-wide text-ink-faint">
            {product.brand ?? product.category}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {product.name}
          </h1>

          <div className="mt-4">
            <Price view={price} size="lg" />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {available ? (
              product.stock <= 5 ? (
                <Badge tone="caution">Ultimele {product.stock} bucăți</Badge>
              ) : (
                <Badge tone="positive">În stoc</Badge>
              )
            ) : (
              <Badge tone="critical">Stoc epuizat</Badge>
            )}
            {product.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>

          {product.description && (
            <p className="mt-6 leading-relaxed text-ink-muted">
              {product.description}
            </p>
          )}

          <div className="mt-8">
            <AddToCartButton
              productId={product.id}
              productName={product.name}
              maxQuantity={product.stock}
              disabled={!available}
            />
          </div>

          <ul className="mt-8 space-y-3 border-t border-line pt-6 text-sm text-ink-muted">
            <li className="flex items-center gap-2.5">
              <Truck className="size-4" strokeWidth={1.75} />
              Livrare în 2–4 zile lucrătoare
            </li>
            <li className="flex items-center gap-2.5">
              <RotateCcw className="size-4" strokeWidth={1.75} />
              Retur gratuit în 30 de zile
            </li>
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="size-4" strokeWidth={1.75} />
              Garanție 24 de luni
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
