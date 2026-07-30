import { FlaskConical, Megaphone, MoveRight, TriangleAlert } from "lucide-react";
import type { ThemeToken } from "@/lib/engine";
import {
  buildCandidateSnapshot,
  getActiveRuleset,
  getRuleNames,
} from "@/lib/rules/service";
import {
  computeTheme,
  explainTheme,
  hasThemeOverrides,
  LAYOUT_VARIANT_LABELS,
  THEME_TOKEN_LABELS,
  type ActorFacts,
  type ThemeView,
} from "@/lib/shop/theme-view";
import { Badge } from "@/components/ui/badge";

/** Cine se uita la magazin — tema poate depinde de client sau de sesiune. */
export type ThemeWho = "guest" | "client" | "vip";

const WHO_LABELS: Record<ThemeWho, string> = {
  guest: "Vizitator (fără cont)",
  client: "Client autentificat",
  vip: "Client VIP",
};

export interface ThemeSimulation {
  who: ThemeWho;
  country: string;
}

export function parseThemeSimulation(params: {
  who?: string;
  country?: string;
}): ThemeSimulation {
  const country = (params.country ?? "RO").toUpperCase().slice(0, 2);
  return {
    who: params.who === "client" || params.who === "vip" ? params.who : "guest",
    country: /^[A-Z]{2}$/.test(country) ? country : "RO",
  };
}

function actorFor(simulation: ThemeSimulation): ActorFacts {
  const authenticated = simulation.who !== "guest";
  return {
    customer: {
      loyaltyTier: simulation.who === "vip" ? "VIP" : "STANDARD",
      loyaltyPoints: simulation.who === "vip" ? 5000 : authenticated ? 100 : 0,
      completedOrders: simulation.who === "vip" ? 20 : authenticated ? 2 : 0,
      country: simulation.country,
    },
    session: { isGuest: !authenticated, isAuthenticated: authenticated },
  };
}

/** Previzualizare in miniatura a magazinului, cu tokenurile temei aplicate. */
function Preview({ view }: { view: ThemeView }) {
  return (
    <div
      style={view.cssVariables as React.CSSProperties}
      className="overflow-hidden rounded-lg border border-line bg-surface"
    >
      {view.banner && (
        <div className="flex items-center justify-center gap-1.5 bg-accent px-2 py-1.5 text-center text-[11px] font-medium text-white">
          <Megaphone className="size-3 shrink-0" strokeWidth={2} />
          <span className="line-clamp-1">{view.banner}</span>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-line bg-surface-raised px-3 py-2">
        <span className="text-xs font-semibold text-ink">Magazin</span>
        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
          Coș
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 p-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-card border border-line bg-surface-raised p-1.5"
          >
            <div className="h-6 rounded bg-zinc-100" />
            <p className="mt-1 truncate text-[10px] text-ink">Produs</p>
            <p className="text-[10px] font-semibold text-accent-ink">199 lei</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultCard({
  tone,
  view,
  ruleNames,
}: {
  tone: "live" | "draft";
  view: ThemeView;
  ruleNames: Map<string, string>;
}) {
  const tokens = Object.entries(view.tokens) as [ThemeToken, string][];

  return (
    <div className="flex-1 rounded-xl border border-line bg-surface p-4">
      {tone === "live" ? (
        <Badge tone="positive">acum în magazin</Badge>
      ) : (
        <Badge tone="caution">după publicare</Badge>
      )}

      <div className="mt-3">
        <Preview view={view} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{LAYOUT_VARIANT_LABELS[view.layoutVariant]}</Badge>
      </div>

      {tokens.length > 0 && (
        <ul className="mt-3 space-y-1">
          {tokens.map(([token, value]) => (
            <li
              key={token}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-ink-muted">{THEME_TOKEN_LABELS[token]}</span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-3.5 rounded border border-line"
                  style={{ background: value }}
                />
                <span className="font-mono text-ink-faint">{value}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-sm text-ink-muted">{explainTheme(view)}</p>
      <p className="mt-1 text-sm text-ink-muted">
        {view.usedDefaults
          ? "Nicio versiune activă."
          : view.matchedRules.length === 0
            ? "Nicio regulă nu se aplică."
            : view.matchedRules.map((key) => ruleNames.get(key) ?? key).join(", ")}
      </p>

      {/* Tokenurile respinse sunt cel mai des cauza unei reguli „fara efect" */}
      {view.rejectedTokens.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-critical">
            <TriangleAlert className="size-3.5" strokeWidth={2} />
            Ignorate din motive de securitate
          </p>
          <ul className="mt-1 space-y-0.5">
            {view.rejectedTokens.map((rejected, i) => (
              <li key={`${rejected.token}-${i}`} className="text-xs text-ink-muted">
                <span className="font-mono">{rejected.token}</span> —{" "}
                {rejected.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors focus:border-accent";

/**
 * „Testează tema": cum arata magazinul cu versiunea activa si — daca exista
 * drafturi — cu snapshotul care ar rezulta din publicare. Foloseste exact
 * aceeasi functie ca magazinul (`computeTheme`), deci previzualizarea nu poate
 * sa difere de realitate.
 */
export async function ThemeTester({
  storeId,
  hasDraftChanges,
  simulation,
}: {
  storeId: string;
  hasDraftChanges: boolean;
  simulation: ThemeSimulation;
}) {
  const [activeRuleset, candidateSnapshot, ruleNames] = await Promise.all([
    getActiveRuleset(storeId, "THEME"),
    buildCandidateSnapshot(storeId, "THEME"),
    getRuleNames(storeId),
  ]);

  const actor = actorFor(simulation);
  const live = computeTheme({
    snapshot: activeRuleset?.snapshot ?? null,
    killSwitch: activeRuleset?.killSwitch,
    actor,
  });
  const candidate = computeTheme({ snapshot: candidateSnapshot, actor });

  const sameOutcome =
    JSON.stringify([live.tokens, live.banner, live.layoutVariant]) ===
    JSON.stringify([candidate.tokens, candidate.banner, candidate.layoutVariant]);

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <FlaskConical className="size-5 text-accent" strokeWidth={1.75} />
        Testează tema
      </h2>

      <div className="mt-3 rounded-xl border border-line bg-surface-raised p-4">
        {/* Navigare GET: testul se poate trimite prin link */}
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-ink-muted">Vizitator</span>
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
            <span className="text-ink-muted">Țară</span>
            <input
              name="country"
              maxLength={2}
              defaultValue={simulation.country}
              className={`${inputCls} mt-1 block w-16 uppercase`}
            />
          </label>
          <button className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm font-medium transition-colors hover:border-ink-faint">
            Previzualizează
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <ResultCard tone="live" view={live} ruleNames={ruleNames} />
          {hasDraftChanges && (
            <>
              <div className="hidden items-center sm:flex">
                <MoveRight className="size-5 text-ink-faint" />
              </div>
              <ResultCard tone="draft" view={candidate} ruleNames={ruleNames} />
            </>
          )}
        </div>

        {live.usedDefaults && (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
            <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
            Nicio versiune activă
            {activeRuleset?.killSwitch && " (kill switch activ)"} — magazinul
            folosește tema implicită.
          </p>
        )}

        {hasDraftChanges && sameOutcome && (
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
            <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
            Drafturile nepublicate nu schimbă tema pentru acest vizitator.
          </p>
        )}

        {!live.usedDefaults && !hasThemeOverrides(live) && (
          <p className="mt-1 text-sm text-ink-muted">
            Versiunea activă nu conține nicio regulă care să schimbe aspectul.
          </p>
        )}

        <p className="mt-3 text-xs text-ink-faint">
          Culorile acceptate: hex (<span className="font-mono">#2563eb</span>),
          rgb()/hsl() sau o lungime pentru rotunjire (
          <span className="font-mono">0.75rem</span>). Orice altă formă este
          respinsă la validare — o regulă nu poate scrie CSS arbitrar.
        </p>
      </div>
    </div>
  );
}
