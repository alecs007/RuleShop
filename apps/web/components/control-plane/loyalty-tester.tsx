import { FlaskConical, Gift, MoveRight, TriangleAlert } from "lucide-react";
import {
  buildCandidateSnapshot,
  getActiveRuleset,
  getRuleNames,
} from "@/lib/rules/service";
import {
  computeLoyalty,
  explainLoyalty,
  pointsLabel,
  type ActorFacts,
  type LoyaltyView,
} from "@ruleshop/storefront";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";

/** The simulated scenario, from the query string, so the test is shareable. */
export interface LoyaltySimulation {
  subtotalLei: number;
  itemCount: number;
  who: "guest" | "client" | "vip";
  completedOrders: number;
}

const WHO_LABELS: Record<LoyaltySimulation["who"], string> = {
  guest: "Vizitator (fără cont)",
  client: "Client autentificat",
  vip: "Client VIP",
};

export function parseLoyaltySimulation(params: {
  subtotal?: string;
  items?: string;
  who?: string;
  orders?: string;
}): LoyaltySimulation {
  const num = (raw: string | undefined, fallback: number, max: number) => {
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.min(value, max) : fallback;
  };
  const who =
    params.who === "client" || params.who === "vip" ? params.who : "guest";
  return {
    subtotalLei: num(params.subtotal, 300, 1_000_000),
    itemCount: Math.round(num(params.items, 2, 999)),
    who,
    completedOrders: Math.round(
      num(params.orders, who === "vip" ? 20 : who === "client" ? 2 : 0, 9999),
    ),
  };
}

function actorFor(simulation: LoyaltySimulation): ActorFacts {
  const authenticated = simulation.who !== "guest";
  return {
    customer: {
      loyaltyTier: simulation.who === "vip" ? "VIP" : "STANDARD",
      loyaltyPoints: simulation.who === "vip" ? 5000 : authenticated ? 100 : 0,
      completedOrders: simulation.completedOrders,
      lifetimeSpend: simulation.who === "vip" ? 500000 : authenticated ? 50000 : 0,
    },
    session: { isGuest: !authenticated, isAuthenticated: authenticated },
  };
}

function ResultCard({
  tone,
  view,
  ruleNames,
  currency,
}: {
  tone: "live" | "draft";
  view: LoyaltyView;
  ruleNames: Map<string, string>;
  currency: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-line bg-surface p-4">
      {tone === "live" ? (
        <Badge tone="positive">acum în magazin</Badge>
      ) : (
        <Badge tone="caution">după publicare</Badge>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold tabular-nums">
          {pointsLabel(view.points)}
        </span>
        {view.extraPoints > 0 && (
          <Badge tone="positive">+{view.extraPoints} din reguli</Badge>
        )}
        <Badge tone="accent">nivel {view.tier}</Badge>
        {view.tierFromRule && (
          <span className="text-xs text-ink-faint">nivel impus de o regulă</span>
        )}
      </div>

      <p className="mt-2 text-sm text-ink-muted">{explainLoyalty(view)}</p>
      <p className="mt-1 text-xs text-ink-faint">
        Bază: {pointsLabel(view.basePoints)} pentru{" "}
        {formatMoney(view.eligibleCents, currency)} (fără livrare).
      </p>

      {view.benefits.length > 0 && (
        <ul className="mt-2 space-y-1">
          {view.benefits.map((benefit) => (
            <li
              key={benefit}
              className="flex items-start gap-1.5 text-sm text-ink-muted"
            >
              <Gift
                className="mt-0.5 size-3.5 shrink-0 text-accent"
                strokeWidth={1.75}
              />
              {benefit}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-sm text-ink-muted">
        {view.usedDefaults
          ? "Nicio regulă activă — doar punctele de bază."
          : view.matchedRules.length === 0
            ? "Nicio regulă nu se aplică."
            : view.matchedRules.map((key) => ruleNames.get(key) ?? key).join(", ")}
      </p>

      {!view.creditable && (
        <p className="mt-2 text-xs text-ink-faint">
          Cumpărătorul nu are cont — punctele se calculează, dar nu se acumulează.
        </p>
      )}
    </div>
  );
}

const inputCls =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors focus:border-accent";

/**
 * Rewards for a cart under the active version and, if there are drafts, under
 * the snapshot a publish would produce. Uses `computeLoyalty`, the same
 * function the storefront does.
 */
export async function LoyaltyTester({
  storeId,
  currency,
  hasDraftChanges,
  simulation,
}: {
  storeId: string;
  currency: string;
  hasDraftChanges: boolean;
  simulation: LoyaltySimulation;
}) {
  const [activeRuleset, candidateSnapshot, ruleNames] = await Promise.all([
    getActiveRuleset(storeId, "LOYALTY"),
    buildCandidateSnapshot(storeId, "LOYALTY"),
    getRuleNames(storeId),
  ]);

  const subtotalCents = Math.round(simulation.subtotalLei * 100);
  const actor = actorFor(simulation);
  const cart = {
    subtotalCents,
    itemCount: simulation.itemCount,
    weightGrams: 0,
    categories: [],
  };
  const order = { totalCents: subtotalCents, shippingCents: 0 };

  const live = computeLoyalty({
    snapshot: activeRuleset?.snapshot ?? null,
    killSwitch: activeRuleset?.killSwitch,
    cart,
    order,
    actor,
  });
  const candidate = computeLoyalty({
    snapshot: candidateSnapshot,
    cart,
    order,
    actor,
  });

  const sameOutcome =
    live.points === candidate.points &&
    live.tier === candidate.tier &&
    JSON.stringify(live.benefits) === JSON.stringify(candidate.benefits);

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <FlaskConical className="size-5 text-accent" strokeWidth={1.75} />
        Testează un scenariu
      </h2>

      <div className="mt-3 rounded-xl border border-line bg-surface-raised p-4">
        {/* GET navigation, so the test can be shared as a link */}
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-ink-muted">Subtotal coș</span>
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
          <label className="text-sm">
            <span className="text-ink-muted">Comenzi finalizate</span>
            <input
              type="number"
              name="orders"
              min="0"
              max="9999"
              defaultValue={simulation.completedOrders}
              className={`${inputCls} mt-1 block w-24 tabular-nums`}
            />
          </label>
          <button className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm font-medium transition-colors hover:border-ink-faint">
            Evaluează
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <ResultCard
            tone="live"
            view={live}
            ruleNames={ruleNames}
            currency={currency}
          />
          {hasDraftChanges && (
            <>
              <div className="hidden items-center sm:flex">
                <MoveRight className="size-5 text-ink-faint" />
              </div>
              <ResultCard
                tone="draft"
                view={candidate}
                ruleNames={ruleNames}
                currency={currency}
              />
            </>
          )}
        </div>

        {live.usedDefaults && (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
            <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
            Nicio versiune activă
            {activeRuleset?.killSwitch && " (kill switch activ)"} — clienții
            primesc doar punctele de bază.
          </p>
        )}

        {hasDraftChanges && sameOutcome && (
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
            <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
            Drafturile nepublicate nu schimbă nimic pentru acest scenariu.
          </p>
        )}

        <p className="mt-3 text-xs text-ink-faint">
          Punctele de bază se calculează din subtotalul de după reduceri, fără
          costul livrării: 1 punct pentru fiecare {formatMoney(100, currency)}.
        </p>
      </div>
    </div>
  );
}
