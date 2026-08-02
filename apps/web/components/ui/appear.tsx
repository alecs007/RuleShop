/**
 * Fades a list of items in. `resetKey` remounts the container: without it React
 * would reconcile the old list with the new one and items still on screen
 * would not animate.
 *
 * The animation is CSS, not JS, so the list stays a server component and the
 * catalog page loads no animation library just to fade.
 */

/**
 * Past this many items the stagger stops growing, or the last card in a full
 * catalog would start appearing half a second into a page that rendered in
 * tens of milliseconds.
 */
const MAX_STAGGERED = 8;

/** Stagger between items, in milliseconds. */
const STAGGER_MS = 25;

export function AppearList({
  children,
  resetKey,
  className,
  as: Component = "div",
}: {
  children: React.ReactNode;
  /** Changing this replays the animation. */
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
  /** Position in the list, which sets the delay. */
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
