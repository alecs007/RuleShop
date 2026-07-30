import {
  BadgePercent,
  Boxes,
  Gift,
  Palette,
  ShieldAlert,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { DecisionCategory } from "@/lib/engine";
import { cn } from "@/lib/utils/cn";

export const CATEGORY_ICONS: Record<DecisionCategory, LucideIcon> = {
  PRICING: BadgePercent,
  SHIPPING: Truck,
  FRAUD: ShieldAlert,
  AVAILABILITY: Boxes,
  LOYALTY: Gift,
  THEME: Palette,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: DecisionCategory;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon className={cn("size-5", className)} strokeWidth={1.75} />;
}

export function CategoryIconBadge({
  category,
  className,
}: {
  category: DecisionCategory;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-ink-muted transition-colors group-hover:bg-blue-50 group-hover:text-accent",
        className,
      )}
    >
      <CategoryIcon category={category} />
    </span>
  );
}
