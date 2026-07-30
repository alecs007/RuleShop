"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";

/**
 * Apariția lină a unei liste de elemente (ex: cardurile de produs când se
 * schimbă categoria).
 *
 * `resetKey` remontează containerul: fără el, React ar reconcilia lista veche cu
 * cea nouă și elementele rămase pe ecran nu s-ar mai anima. Cu el, fiecare
 * schimbare de filtru redă intrarea.
 *
 * Când utilizatorul cere mai puțină mișcare (`prefers-reduced-motion`),
 * elementele apar direct, fără deplasare.
 */

/** Decalajul dintre elemente; suficient să se citească, prea mic să se aștepte. */
const STAGGER_SECONDS = 0.04;
/** Peste acest număr de elemente stagger-ul s-ar simți ca o întârziere. */
const MAX_STAGGERED = 12;

/**
 * Containerul doar propagă starea către copii; decalajul stă în fiecare element
 * (prin `index`), ca să funcționeze și când elementele nu sunt copii direcți.
 */
const container: Variants = { hidden: {}, visible: {} };

export function AppearList({
  children,
  resetKey,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  /** Valoare care, când se schimbă, redă animația (ex: categoria activă). */
  resetKey?: string;
  className?: string;
  as?: "div" | "ul";
}) {
  const Component = as === "ul" ? motion.ul : motion.div;

  return (
    <Component
      key={resetKey}
      variants={container}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </Component>
  );
}

export function AppearItem({
  children,
  index = 0,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  /** Poziția în listă — decide decalajul de intrare. */
  index?: number;
  className?: string;
  as?: "div" | "li";
}) {
  const reduceMotion = useReducedMotion();
  const Component = as === "li" ? motion.li : motion.div;

  return (
    <Component
      variants={{
        hidden: { opacity: 0, y: reduceMotion ? 0 : 10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: reduceMotion ? 0 : 0.28,
            ease: "easeOut",
            delay: Math.min(index, MAX_STAGGERED) * STAGGER_SECONDS,
          },
        },
      }}
      className={className}
    >
      {children}
    </Component>
  );
}
