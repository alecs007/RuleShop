import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Truck, RotateCcw, ShieldCheck } from "lucide-react";
import { getActiveStore } from "@/lib/shop/store";
import { getProductBySlug } from "@/lib/shop/products";
import { getPriceView } from "@/lib/shop/pricing";
import {
  availabilityLabel,
  availabilityTone,
  getAvailabilityView,
} from "@/lib/shop/availability";
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

  // `record`: vizita pe pagina de produs e un eveniment real de evaluare —
  // intra in istoricul pe care ruleaza simularea si analiza IA.
  const [price, availability] = await Promise.all([
    getPriceView(product, { record: "product-page" }),
    getAvailabilityView(product, { record: "product-page" }),
  ]);
  // Un produs ascuns de reguli nu exista pentru clienti — nici prin link direct.
  if (availability.hidden) notFound();

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
            {/* Starea de disponibilitate vine din decizia AVAILABILITY */}
            <Badge tone={availabilityTone(availability)}>
              {availabilityLabel(availability)}
            </Badge>
            {availability.badges.map((badge) => (
              <Badge key={badge} tone="accent" className="uppercase">
                {badge}
              </Badge>
            ))}
            {availability.available && availability.ruleLimit !== null && (
              <Badge>maximum {availability.maxPerOrder} bucăți / comandă</Badge>
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
              maxQuantity={availability.maxPerOrder}
              disabled={!availability.available}
              disabledLabel={availabilityLabel(availability)}
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
