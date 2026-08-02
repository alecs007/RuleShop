"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils/cn";

/**
 * Fades an image in instead of letting it pop. `onLoad` covers the cached case
 * too: React fires it for an already-complete image.
 *
 * The `fade-img` class exists for the root layout's `<noscript>`: without JS
 * no `onLoad` ever arrives and the image would stay transparent forever.
 */
// `alt` is explicit rather than spread, or the a11y lint rule cannot see it.
export function FadeImage({ className, alt, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Image
      {...props}
      alt={alt}
      onLoad={() => setLoaded(true)}
      className={cn(
        "fade-img transition-opacity duration-500 ease-out motion-reduce:transition-none",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
