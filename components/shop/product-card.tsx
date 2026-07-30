import Link from "next/link";
import Image from "next/image";
import type { Product } from "@prisma/client";
import type { PriceView } from "@/lib/shop/pricing";
import {
  availabilityLabel,
  type AvailabilityView,
} from "@/lib/shop/availability-view";
import { Badge } from "@/components/ui/badge";
import { Price } from "./price";

export function ProductCard({
  product,
  price,
  availability,
}: {
  product: Product;
  price: PriceView;
  /** Decizia AVAILABILITY; fara ea, cardul se ghideaza doar dupa stoc. */
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

  return (
    <Link
      href={`/products/${product.slug}`}
      // `h-full`: cardul umple celula de grilă, care acum e învelișul de animație.
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
        {(lowStock ||
          (availability && availability.available && availability.message) ||
          availability?.badges.length) && (
          <div className="flex flex-wrap gap-1.5">
            {availability?.badges.map((badge) => (
              <Badge key={badge} tone="accent" className="w-fit uppercase">
                {badge}
              </Badge>
            ))}
            {lowStock && !unavailable && (
              <Badge tone="caution" className="w-fit">
                Ultimele {availability?.stock ?? product.stock} bucăți
              </Badge>
            )}
            {availability && availability.available && availability.message && (
              <Badge className="w-fit">{availability.message}</Badge>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
