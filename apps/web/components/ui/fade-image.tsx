"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils/cn";

/**
 * Imagine care se stinge în locul ei, în loc să apară dintr-o dată.
 *
 * Pe o pagină de produs imaginea mare e ultima care sosește (HTML-ul e deja
 * afișat), deci ea dă senzația de „a apărut brusc". `onLoad` acoperă și cazul
 * în care e deja în cache: React îl declanșează și pentru o imagine completă.
 *
 * Clasa `fade-img` există pentru `<noscript>`-ul din layout-ul rădăcină: fără
 * JS nu vine niciun `onLoad`, deci imaginea trebuie forțată la vizibil, altfel
 * ar rămâne transparentă pentru totdeauna.
 */
// `alt` e explicit, nu prin spread: altfel regula de accesibilitate nu-l vede.
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
