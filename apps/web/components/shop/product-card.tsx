import Link from "next/link";
import Image from "next/image";
import type { Product } from "@prisma/client";
import type { PriceView } from "@/lib/shop/pricing";
import {
  availabilityLabel,
  type AvailabilityView,
} from "@ruleshop/storefront";
import { Badge } from "@/components/ui/badge";
import { Price } from "./price";
import { storeHref } from "@/lib/shop/routing";

export function ProductCard({
  product,
  price,
  availability,
  prefix,
}: {
  /** The store prefix, so the card links inside the same store. */
  prefix: string | null;
  product: Product;
  price: PriceView;
  /** The AVAILABILITY decision; without it the card goes by stock alone. */
  availability?: AvailabilityView;
}) {
  const image = product.imageUrls[0];
  const unavailable = availability ? !availability.available : product.stock <= 0;
  const unavailableText = availability
    ? availabilityLabel(availability)
    : "Stoc epuizat";
  const lowStock = availability
    ? availability.lowStock
    : product.stock > 0 && product.stock <= 5;

  // The visibility condition must be boolean: `array.length && <JSX>` would
  // render a literal 0 on cards with no badges.
  const badges = availability?.badges ?? [];
  const showLowStock = lowStock && !unavailable;
  const message =
    availability?.available && availability.message ? availability.message : null;
  const hasBadges = badges.length > 0 || showLowStock || message !== null;

  return (
    <Link
      href={storeHref(prefix, `/products/${product.slug}`)}
      // `h-full`: the card fills the grid cell, now the animation wrapper.
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface-raised transition-all hover:border-ink-faint hover:shadow-subtle"
    >
      <div className="relative aspect-square overflow-hidden bg-white">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain transition-transform duration-300 group-hover:scale-[1.03] "
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-faint">
            {product.name.charAt(0)}
          </div>
        )}
        {unavailable && (
          <div className="absolute inset-x-0 bottom-0 bg-ink/70 py-1.5 text-center text-xs font-medium text-white">
            {unavailableText}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="text-xs uppercase tracking-wide text-ink-faint">
          {product.brand ?? product.category}
        </p>
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">
          {product.name}
        </h3>
        <div className="mt-auto pt-2">
          <Price view={price} />
        </div>
        {hasBadges && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <Badge key={badge} tone="accent" className="w-fit uppercase">
                {badge}
              </Badge>
            ))}
            {showLowStock && (
              <Badge tone="caution" className="w-fit">
                Ultimele {availability?.stock ?? product.stock} bucăți
              </Badge>
            )}
            {message && <Badge className="w-fit">{message}</Badge>}
          </div>
        )}
      </div>
    </Link>
  );
}
