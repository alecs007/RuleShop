import { FlaskConical, TriangleAlert } from "lucide-react";
import {
  buildCandidateSnapshot,
  getActiveRuleset,
  getRuleNames,
} from "@/lib/rules/service";
import {
  assessFraud,
  DECISION_LABELS,
  RISK_LEVEL_LABELS,
  type FraudAssessment,
  type FraudDecisionValue,
} from "@ruleshop/storefront";
import { Badge } from "@/components/ui/badge";

/** The simulated scenario, from the query string, so the test is shareable. */
export interface FraudSimulation {
  totalLei: number;
  itemCount: number;
  who: "guest" | "client" | "vip";
  country: string;
  ordersLastHour: number;
  addressMismatch: boolean;
}

const WHO_LABELS: Record<FraudSimulation["who"], string> = {
  guest: "Vizitator (fără cont)",
  client: "Client autentificat",
  vip: "Client VIP",
};

export function parseFraudSimulation(params: {
  total?: string;
  fitems?: string;
  fwho?: string;
  country?: string;
  velocity?: string;
  mismatch?: string;
}): FraudSimulation {
  const num = (raw: string | undefined, fallback: number, max: number) => {
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.min(value, max) : fallback;
  };
  const country = (params.country ?? "RO").toUpperCase().slice(0, 2);
  return {
    totalLei: num(params.total, 500, 1_000_000),
    itemCount: Math.round(num(params.fitems, 2, 999)),
    who:
      params.fwho === "client" || params.fwho === "vip" ? params.fwho : "guest",
    country: /^[A-Z]{2}$/.test(country) ? country : "RO",
    ordersLastHour: Math.round(num(params.velocity, 0, 99)),
    addressMismatch: params.mismatch === "1",
  };
}

const DECISION_TONES: Record<
  FraudDecisionValue,
  "neutral" | "positive" | "caution" | "critical"
> = {
  ALLOW: "positive",
  CHALLENGE: "caution",
  REVIEW: "caution",
  BLOCK: "critical",
};

function ResultCard({
  tone,
  assessment,
  ruleNames,
}: {
  tone: "live" | "draft";
  assessment: FraudAssessment;
  ruleNames: Map<string, string>;
}) {
  const decision = assessment.decision;
  return (
    <div className="flex-1 rounded-xl border border-line bg-surface p-4">
      {tone === "live" ? (
        <Badge tone="positive">acum în magazin</Badge>
      ) : (
        <Badge tone="caution">după publicare</Badge>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={DECISION_TONES[decision]}>{DECISION_LABELS[decision]}</Badge>
        <span className="text-sm tabular-nums text-ink-muted">
          scor {assessment.riskScore} ·{" "}
          {RISK_LEVEL_LABELS[assessment.riskLevel].toLowerCase()}
        </span>
      </div>

      <p className="mt-2 text-sm text-ink-muted">
        {assessment.matchedRules.length === 0
          ? "Nicio regulă nu se aplică."
          : assessment.matchedRules
              .map((key) => ruleNames.get(key) ?? key)
              .join(", ")}
      </p>

      {assessment.flaggedSignals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {assessment.flaggedSignals.map((signal) => (
            <Badge key={signal} tone="caution">
              {signal}
            </Badge>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-ink-faint">
        {assessment.decisionSource === "rule"
          ? "Decizie fixată de o regulă."
          : assessment.decisionSource === "score"
            ? `Prin praguri: verificare ${assessment.thresholds.challenge}, manual ${assessment.thresholds.review}, blocare ${assessment.thresholds.block}.`
            : "Nicio regulă potrivită — comanda trece."}
      </p>
    </div>
  );
}

const inputCls =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors focus:border-accent";

/**
 * The fraud check for an attempted order, under the active version and, if
 * there are drafts, under the snapshot a publish would produce. Uses
 * `assessFraud`, the same function checkout does.
 */
export async function FraudTester({
  storeId,
  currency,
  hasDraftChanges,
  simulation,
}: {
  storeId: string;
  currency: string;
  hasDraftChanges: boolean;
  simulation: FraudSimulation;
}) {
  const [activeRuleset, candidateSnapshot, ruleNames] = await Promise.all([
    getActiveRuleset(storeId, "FRAUD"),
    buildCandidateSnapshot(storeId, "FRAUD"),
    getRuleNames(storeId),
  ]);

  const totalCents = Math.round(simulation.totalLei * 100);
  const authenticated = simulation.who !== "guest";
  const facts = {
    cart: {
      subtotalCents: totalCents,
      itemCount: simulation.itemCount,
      categories: [],
      weightGrams: 0,
    },
    customer: {
      loyaltyTier: simulation.who === "vip" ? "VIP" : "STANDARD",
      loyaltyPoints: simulation.who === "vip" ? 5000 : 0,
      completedOrders: simulation.who === "vip" ? 20 : authenticated ? 2 : 0,
      lifetimeSpend: simulation.who === "vip" ? 500000 : 0,
      country: simulation.country,
      emailDomain: "gmail.com",
    },
    session: {
      isGuest: !authenticated,
      isAuthenticated: authenticated,
      ipCountry: simulation.country,
      ordersLastHour: simulation.ordersLastHour,
      ordersLastDay: simulation.ordersLastHour,
      priorBlocks: 0,
      priorReviews: 0,
      accountAgeDays: authenticated ? (simulation.who === "vip" ? 400 : 30) : 0,
    },
    order: {
      totalCents,
      shippingCents: 0,
      shippingCountry: simulation.country,
      billingCountry: simulation.addressMismatch ? "DE" : simulation.country,
      addressMismatch: simulation.addressMismatch,
      paymentMethod: "card",
      itemCount: simulation.itemCount,
    },
  };

  const live = assessFraud({
    snapshot: activeRuleset?.snapshot ?? null,
    killSwitch: activeRuleset?.killSwitch,
    facts,
  });
  const candidate = assessFraud({ snapshot: candidateSnapshot, facts });
  const sameOutcome =
    live.decision === candidate.decision &&
    live.riskScore === candidate.riskScore;

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <FlaskConical className="size-5 text-accent" strokeWidth={1.75} />
        Testează un scenariu
      </h2>

      <div className="mt-3 rounded-xl border border-line bg-surface-raised p-4">
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-ink-muted">Total comandă</span>
            <span className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                name="total"
                min="0"
                step="0.01"
                defaultValue={simulation.totalLei}
                className={`${inputCls} w-28 tabular-nums`}
              />
              <span className="text-xs text-ink-faint">lei</span>
            </span>
          </label>
          <label className="text-sm">
            <span className="text-ink-muted">Produse</span>
            <input
              type="number"
              name="fitems"
              min="0"
              max="999"
              defaultValue={simulation.itemCount}
              className={`${inputCls} mt-1 block w-20 tabular-nums`}
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-muted">Cumpărător</span>
            <select
              name="fwho"
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
            <span className="text-ink-muted">Țară</span>
            <input
              name="country"
              maxLength={2}
              defaultValue={simulation.country}
              className={`${inputCls} mt-1 block w-16 uppercase`}
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-muted">Comenzi/oră</span>
            <input
              type="number"
              name="velocity"
              min="0"
              max="99"
              defaultValue={simulation.ordersLastHour}
              className={`${inputCls} mt-1 block w-20 tabular-nums`}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="mismatch"
              value="1"
              defaultChecked={simulation.addressMismatch}
              className="size-4 accent-ink"
            />
            <span className="text-ink-muted">Adrese diferite</span>
          </label>
          <button className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm font-medium transition-colors hover:border-ink-faint">
            Evaluează
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <ResultCard tone="live" assessment={live} ruleNames={ruleNames} />
          {hasDraftChanges && (
            <ResultCard tone="draft" assessment={candidate} ruleNames={ruleNames} />
          )}
        </div>

        {live.usedDefaults && (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
            <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
            Nicio versiune activă
            {activeRuleset?.killSwitch && " (kill switch activ)"} — toate comenzile
            trec fără verificare.
          </p>
        )}

        {hasDraftChanges && sameOutcome && (
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
            <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
            Drafturile nepublicate nu schimbă nimic pentru acest scenariu.
          </p>
        )}

        <p className="mt-3 text-xs text-ink-faint">
          Moneda magazinului: {currency}. Semnalele de istoric (comenzi blocate
          anterior, vechimea contului) se calculează din baza de date la checkout;
          aici sunt simulate.
        </p>
      </div>
    </div>
  );
}
