import { FlaskConical, MoveRight, TriangleAlert } from "lucide-react";
import { buildCandidateSnapshot, getActiveRuleset, getRuleNames } from "@/lib/rules/service";
import { readShippingMethods } from "@ruleshop/storefront";
import {
  computeShippingQuote,
  type ActorFacts,
  type ShippingOption,
  type ShippingQuote,
} from "@ruleshop/storefront";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";

/** The simulated cart, from the query string, so the test is shareable. */
export interface ShippingSimulation {
  subtotalLei: number;
  itemCount: number;
  weightKg: number;
  who: "guest" | "client" | "vip";
}

const WHO_LABELS: Record<ShippingSimulation["who"], string> = {
  guest: "Vizitator (fără cont)",
  client: "Client autentificat",
  vip: "Client VIP",
};

export function parseSimulation(params: {
  subtotal?: string;
  items?: string;
  weight?: string;
  who?: string;
}): ShippingSimulation {
  const num = (raw: string | undefined, fallback: number, max: number) => {
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.min(value, max) : fallback;
  };
  return {
    subtotalLei: num(params.subtotal, 300, 1_000_000),
    itemCount: Math.round(num(params.items, 2, 999)),
    weightKg: num(params.weight, 1, 1000),
    who: params.who === "client" || params.who === "vip" ? params.who : "guest",
  };
}

function actorFor(who: ShippingSimulation["who"]): ActorFacts {
  if (who === "guest") {
    return {
      customer: { loyaltyTier: "STANDARD", loyaltyPoints: 0, completedOrders: 0 },
      session: { isGuest: true, isAuthenticated: false },
    };
  }
  return {
    customer: {
      loyaltyTier: who === "vip" ? "VIP" : "STANDARD",
      loyaltyPoints: who === "vip" ? 5000 : 100,
      completedOrders: who === "vip" ? 20 : 2,
    },
    session: { isGuest: false, isAuthenticated: true },
  };
}

function eta(option: ShippingOption): string {
  const { etaDaysMin: min, etaDaysMax: max } = option;
  if (min === 0 && max === 0) return "astăzi";
  return min === max ? `${max} ${max === 1 ? "zi" : "zile"}` : `${min}–${max} zile`;
}

/** One method's cell, in either column. */
function MethodCell({
  quote,
  methodId,
  ruleNames,
}: {
  quote: ShippingQuote;
  methodId: string;
  ruleNames: Map<string, string>;
}) {
  const available = quote.options.find((o) => o.id === methodId);
  const excluded = quote.disabledOptions.find((o) => o.id === methodId);
  const option = available ?? excluded;
  if (!option) return <span className="text-ink-faint">—</span>;

  const rules = option.matchedRules.map((key) => ruleNames.get(key) ?? key);

  return (
    <div>
      {available ? (
        <div className="flex flex-wrap items-baseline gap-1.5">
          {option.free ? (
            <Badge tone="positive">Gratuită</Badge>
          ) : (
            <span className="font-medium tabular-nums">
              {formatMoney(option.costCents, quote.currency)}
            </span>
          )}
          {option.costCents !== option.baseCostCents && option.baseCostCents > 0 && (
            <s className="text-xs tabular-nums text-ink-faint">
              {formatMoney(option.baseCostCents, quote.currency)}
            </s>
          )}
          <span className="text-xs text-ink-faint">{eta(option)}</span>
        </div>
      ) : (
        <Badge tone="critical">Indisponibilă</Badge>
      )}
      {rules.length > 0 && (
        <p className="mt-0.5 text-xs text-ink-muted">{rules.join(", ")}</p>
      )}
    </div>
  );
}

const inputCls =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors focus:border-accent";

/**
 * Shipping costs under the active version and, if there are drafts, under the
 * snapshot a publish would produce. Uses `computeShippingQuote`, the same
 * function the storefront does, so this is what the customer will pay.
 */
export async function ShippingTester({
  storeId,
  storeSettings,
  currency,
  hasDraftChanges,
  simulation,
}: {
  storeId: string;
  storeSettings: unknown;
  currency: string;
  hasDraftChanges: boolean;
  simulation: ShippingSimulation;
}) {
  const [activeRuleset, candidateSnapshot, ruleNames] = await Promise.all([
    getActiveRuleset(storeId, "SHIPPING"),
    buildCandidateSnapshot(storeId, "SHIPPING"),
    getRuleNames(storeId),
  ]);

  const methods = readShippingMethods(storeSettings);
  const cart = {
    subtotalCents: Math.round(simulation.subtotalLei * 100),
    itemCount: simulation.itemCount,
    weightGrams: Math.round(simulation.weightKg * 1000),
    categories: [],
  };
  const actor = actorFor(simulation.who);

  const live = computeShippingQuote({
    methods,
    snapshot: activeRuleset?.snapshot ?? null,
    killSwitch: activeRuleset?.killSwitch,
    cart,
    currency,
    actor,
  });
  const candidate = computeShippingQuote({
    methods,
    snapshot: candidateSnapshot,
    cart,
    currency,
    actor,
  });

  const sameOutcome =
    JSON.stringify(live.options.map((o) => [o.id, o.costCents, o.etaDaysMin, o.etaDaysMax])) ===
    JSON.stringify(candidate.options.map((o) => [o.id, o.costCents, o.etaDaysMin, o.etaDaysMax]));

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <FlaskConical className="size-5 text-accent" strokeWidth={1.75} />
        Testează pe un coș
      </h2>

      <div className="mt-3 rounded-xl border border-line bg-surface-raised p-4">
        {/* GET navigation, so the test can be shared as a link */}
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-ink-muted">Subtotal</span>
            <span className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                name="subtotal"
                min="0"
                step="0.01"
                defaultValue={simulation.subtotalLei}
                className={`${inputCls} w-28 tabular-nums`}
              />
              <span className="text-xs text-ink-faint">lei</span>
            </span>
          </label>
          <label className="text-sm">
            <span className="text-ink-muted">Produse</span>
            <input
              type="number"
              name="items"
              min="0"
              max="999"
              defaultValue={simulation.itemCount}
              className={`${inputCls} mt-1 block w-20 tabular-nums`}
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-muted">Greutate</span>
            <span className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                name="weight"
                min="0"
                step="0.1"
                defaultValue={simulation.weightKg}
                className={`${inputCls} w-20 tabular-nums`}
              />
              <span className="text-xs text-ink-faint">kg</span>
            </span>
          </label>
          <label className="text-sm">
            <span className="text-ink-muted">Cumpărător</span>
            <select
              name="who"
              defaultValue={simulation.who}
              className={`${inputCls} mt-1 block cursor-pointer`}
            >
              {Object.entries(WHO_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm font-medium transition-colors hover:border-ink-faint">
            Calculează
          </button>
        </form>

        <div className="mt-4 -mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-4 font-medium">Metodă</th>
                <th className="py-2 pr-4 font-medium">
                  <Badge tone="positive">acum în magazin</Badge>
                </th>
                {hasDraftChanges && (
                  <th className="py-2 font-medium">
                    <Badge tone="caution">după publicare</Badge>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {methods.map((method) => (
                <tr key={method.id}>
                  <td className="py-2.5 pr-4">
                    <p className="font-medium">{method.label}</p>
                    <p className="text-xs text-ink-faint">
                      listă: {formatMoney(method.costCents, currency)}
                    </p>
                  </td>
                  <td className="py-2.5 pr-4">
                    <MethodCell quote={live} methodId={method.id} ruleNames={ruleNames} />
                  </td>
                  {hasDraftChanges && (
                    <td className="py-2.5">
                      <MethodCell
                        quote={candidate}
                        methodId={method.id}
                        ruleNames={ruleNames}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          {live.usedDefaults ? (
            <>
              <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
              Nicio versiune activă{activeRuleset?.killSwitch && " (kill switch activ)"} —
              clientul plătește costurile de listă.
            </>
          ) : (
            <>
              Totalul clientului pornește de la{" "}
              <span className="font-medium text-ink">
                {live.cheapest
                  ? formatMoney(live.cheapest.costCents, currency)
                  : "livrare indisponibilă"}
              </span>
              {live.forcedMethodId && (
                <>
                  <MoveRight className="size-4" strokeWidth={1.75} />
                  o regulă impune o singură metodă
                </>
              )}
            </>
          )}
        </p>

        {hasDraftChanges && sameOutcome && (
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
            <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
            Drafturile nepublicate nu schimbă nimic pentru acest coș.
          </p>
        )}
      </div>
    </div>
  );
}
