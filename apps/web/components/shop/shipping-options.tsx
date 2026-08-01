import { Truck } from "lucide-react";
import type { ShippingQuote } from "@/lib/shop/shipping";

/**
 * Explicația deciziei de livrare (ce reguli au acționat).
 *
 * Lista de metode și rândul de livrare din sumar trăiesc în
 * `components/shop/cart-view.tsx`, unde alegerea clientului se aplică optimist;
 * aici rămâne doar partea care nu depinde de interacțiune.
 */
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
