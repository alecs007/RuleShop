import type { PriceView } from "@/lib/shop/pricing";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

/** Price display: struck-through original, percentage and badges. */
export function Price({
  view,
  size = "md",
}: {
  view: PriceView;
  size?: "md" | "lg";
}) {
  const hasDiscount = view.finalCents < view.baseCents;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span
        className={cn(
          "font-semibold tabular-nums",
          size === "lg" ? "text-2xl" : "text-base",
          hasDiscount && "text-critical",
        )}
      >
        {formatMoney(view.finalCents, view.currency)}
      </span>
      {hasDiscount && (
        <>
          <s className={cn("tabular-nums text-ink-faint", size === "lg" ? "text-base" : "text-sm")}>
            {formatMoney(view.baseCents, view.currency)}
          </s>
          <Badge tone="critical">−{view.discountPercent}%</Badge>
        </>
      )}
      {view.badges.map((badge) => (
        <Badge key={badge} tone="accent">{badge}</Badge>
      ))}
    </div>
  );
}
