import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Truck, RotateCcw, ShieldCheck } from "lucide-react";
import { requireStore } from "@/lib/shop/store";
import { storeHref } from "@/lib/shop/routing";
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
  params: Promise<{ store: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store: segment, slug } = await params;
  const store = await requireStore(segment);
  const product = await getProductBySlug(store.id, slug);
  return { title: product?.name ?? "Produs" };
}

export default async function ProductPage({ params }: Props) {
  const { store: segment, slug } = await params;
  const store = await requireStore(segment);
  const product = await getProductBySlug(store.id, slug);
  if (!product || !product.active) notFound();

  // `record`: a product page visit is a real evaluation event, and feeds the
  // history the simulation and the AI analysis run on.
  const [price, availability] = await Promise.all([
    getPriceView(product, { record: "product-page" }),
    getAvailabilityView(product, { record: "product-page" }),
  ]);
  // A product hidden by rules does not exist, not even by direct link.
  if (availability.hidden) notFound();

  const image = product.imageUrls[0];

  return (
    // `appear-content`: the content takes the spinner's place with a
    // transition. The spinner is a Suspense fallback, so the animated wrapper
    // in `template.tsx` mounted before it.
    <div className="appear-content py-8">
      <nav
        className="flex items-center gap-1.5 text-sm text-ink-muted"
        aria-label="Breadcrumb"
      >
        <Link href={storeHref(store.pathPrefix, "/products")} className="transition-colors hover:text-ink">
          Produse
        </Link>
        <ChevronRight className="size-3.5" />
        <Link
          href={storeHref(store.pathPrefix, `/products?category=${encodeURIComponent(product.category)}`)}
          className="capitalize transition-colors hover:text-ink"
        >
          {product.category}
        </Link>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
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
            {/* Availability comes from the AVAILABILITY decision */}
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
              prefix={store.pathPrefix}
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
