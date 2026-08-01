/**
 * Apariția lină a unei liste de elemente (ex: cardurile de produs când se
 * schimbă categoria).
 *
 * `resetKey` remontează containerul: fără el, React ar reconcilia lista veche cu
 * cea nouă și elementele rămase pe ecran nu s-ar mai anima. Cu el, fiecare
 * schimbare de filtru redă intrarea.
 *
 * Animația stă în CSS, nu în JS: e o intrare simplă, care nu are nevoie nici de
 * stare, nici de hidratare. Astfel lista rămâne server component, iar pagina de
 * catalog nu mai încarcă o bibliotecă de animație doar ca să facă un fade.
 * `prefers-reduced-motion` e tratat în `globals.css`.
 */

/**
 * Peste acest număr de elemente, decalajul nu mai crește: altfel ultimul card
 * dintr-un catalog plin ar începe să apară după o jumătate de secundă, pe o
 * pagină care s-a randat în câteva zeci de milisecunde.
 */
const MAX_STAGGERED = 8;

/** Decalajul dintre elemente, în milisecunde. */
const STAGGER_MS = 25;

export function AppearList({
  children,
  resetKey,
  className,
  as: Component = "div",
}: {
  children: React.ReactNode;
  /** Valoare care, când se schimbă, redă animația (ex: categoria activă). */
  resetKey?: string;
  className?: string;
  as?: "div" | "ul";
}) {
  return (
    <Component key={resetKey} className={className}>
      {children}
    </Component>
  );
}

export function AppearItem({
  children,
  index = 0,
  className,
  as: Component = "div",
}: {
  children: React.ReactNode;
  /** Poziția în listă — decide decalajul de intrare. */
  index?: number;
  className?: string;
  as?: "div" | "li";
}) {
  return (
    <Component
      className={className ? `appear-item ${className}` : "appear-item"}
      style={
        {
          "--appear-delay": `${Math.min(index, MAX_STAGGERED) * STAGGER_MS}ms`,
        } as React.CSSProperties
      }
    >
      {children}
    </Component>
  );
}
