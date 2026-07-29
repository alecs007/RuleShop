import Link from "next/link";
import Image from "next/image";
import type { Product } from "@prisma/client";
import type { PriceView } from "@/lib/shop/pricing";
import { Badge } from "@/components/ui/badge";
import { Price } from "./price";

export function ProductCard({
  product,
  price,
}: {
  product: Product;
  price: PriceView;
}) {
  const image = product.imageUrls[0];
  const outOfStock = product.stock <= 0;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface-raised transition-all hover:border-ink-faint hover:shadow-subtle"
    >
      <div className="relative aspect-square overflow-hidden bg-zinc-100">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-faint">
            {product.name.charAt(0)}
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-x-0 bottom-0 bg-ink/70 py-1.5 text-center text-xs font-medium text-white">
            Stoc epuizat
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
        {product.stock > 0 && product.stock <= 5 && (
          <Badge tone="caution" className="w-fit">Ultimele {product.stock} bucati</Badge>
        )}
      </div>
    </Link>
  );
}
