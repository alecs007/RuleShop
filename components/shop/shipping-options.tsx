import { Check, Truck } from "lucide-react";
import type { ShippingQuote } from "@/lib/shop/shipping";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { selectShippingMethodAction } from "@/app/(shop)/cart/actions";

function eta(min: number, max: number): string {
  if (min === 0 && max === 0) return "astăzi";
  if (min === max) return `${max} ${max === 1 ? "zi" : "zile"}`;
  return `${min}–${max} zile`;
}

export function ShippingOptions({ quote }: { quote: ShippingQuote }) {
  if (quote.options.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Momentan nu există metode de livrare disponibile pentru acest coș.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {quote.options.map((option) => {
        const reduced = option.costCents < option.baseCostCents;
        const selected = quote.selected?.id === option.id;
        return (
          <li key={option.id}>
            <form action={selectShippingMethodAction}>
              <input type="hidden" name="methodId" value={option.id} />
              <button
                aria-pressed={selected}
                className={
                  selected
                    ? "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-ink bg-surface px-2.5 py-2 text-left text-sm transition-colors"
                    : "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-line hover:bg-surface"
                }
              >
                <span
                  aria-hidden
                  className={
                    selected
                      ? "flex size-4 shrink-0 items-center justify-center rounded-full bg-ink text-white"
                      : "size-4 shrink-0 rounded-full border border-line"
                  }
                >
                  {selected && <Check className="size-3" strokeWidth={3} />}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={selected ? "font-medium text-ink" : "text-ink"}
                  >
                    {option.label}
                  </span>
                  <span className="ml-1.5 text-xs text-ink-faint">
                    {eta(option.etaDaysMin, option.etaDaysMax)}
                  </span>
                </span>

                <span className="flex shrink-0 items-baseline gap-1.5">
                  {reduced && option.baseCostCents > 0 && (
                    <s className="text-xs tabular-nums text-ink-faint">
                      {formatMoney(option.baseCostCents, quote.currency)}
                    </s>
                  )}
                  {option.free ? (
                    <Badge tone="positive">Gratuită</Badge>
                  ) : (
                    <span className="font-medium tabular-nums">
                      {formatMoney(option.costCents, quote.currency)}
                    </span>
                  )}
                </span>
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}

/** Rândul de livrare din sumarul comenzii — metoda aleasa. */
export function ShippingSummaryRow({ quote }: { quote: ShippingQuote }) {
  const selected = quote.selected;
  if (!selected) return <span className="text-ink-muted">indisponibilă</span>;

  return selected.free ? (
    <span className="font-medium text-positive">Gratuită</span>
  ) : (
    <span className="font-medium tabular-nums">
      {formatMoney(selected.costCents, quote.currency)}
    </span>
  );
}

/** Explicația deciziei de livrare (ce reguli au acționat). */
export function ShippingExplanation({
  quote,
  ruleNames,
}: {
  quote: ShippingQuote;
  ruleNames: Map<string, string>;
}) {
  const applied = [
    ...new Set(
      [...quote.options, ...quote.disabledOptions].flatMap(
        (o) => o.matchedRules,
      ),
    ),
  ];
  const hasNotes =
    applied.length > 0 ||
    quote.disabledOptions.length > 0 ||
    quote.selectionChanged;
  if (!hasNotes) return null;

  return (
    <div className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-xs text-ink-muted">
      <Truck className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
      <div>
        {applied.length > 0 && (
          <p>
            Livrare calculată de:{" "}
            {applied.map((key) => ruleNames.get(key) ?? key).join(", ")}
            {quote.rulesetVersion !== null && ` (v${quote.rulesetVersion})`}
          </p>
        )}
        {quote.selectionChanged && (
          <p className="mt-0.5 text-caution">
            Metoda pe care o alesesei nu mai este disponibilă pentru acest coș —
            am trecut pe {quote.selected?.label ?? "prima variantă disponibilă"}
            .
          </p>
        )}
        {quote.forcedMethodId && (
          <p className="mt-0.5">
            O regulă impune o singură metodă pentru acest coș.
          </p>
        )}
        {!quote.forcedMethodId && quote.disabledOptions.length > 0 && (
          <p className="mt-0.5">
            Indisponibile pentru acest coș:{" "}
            {quote.disabledOptions.map((o) => o.label).join(", ")}.
          </p>
        )}
      </div>
    </div>
  );
}
