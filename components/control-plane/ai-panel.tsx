import {
  BarChart3,
  Bot,
  Check,
  History,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import type { AiSuggestion } from "@prisma/client";
import type { DecisionCategory, EngineRule } from "@/lib/engine";
import { isAiConfigured } from "@/lib/ai/gemini";
import {
  computeUsageStats,
  getEvaluationEvents,
} from "@/lib/rules/evaluation-log";
import {
  compareSnapshots,
  type SnapshotMetrics,
} from "@/lib/rules/simulation";
import { buildCandidateSnapshot, getActiveRuleset } from "@/lib/rules/service";
import { listSuggestions } from "@/lib/ai/suggestions";
import { tryHumanizeRule } from "@/lib/rules/humanize";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { AiAnalyzeButton } from "./ai-analyze-button";
import {
  acceptSuggestionAction,
  rejectSuggestionAction,
  runAiAnalysisAction,
  type AiActionState,
} from "@/app/(control-plane)/admin/rules/ai-actions";

/** Etichetele agregatelor de simulare, pe categorii (chei din simulation.ts). */
const AGGREGATE_LABELS: Record<string, string> = {
  discountedEvaluations: "Evaluări cu reducere",
  discountedShare: "Pondere reduceri (%)",
  avgDiscountPercent: "Reducere medie (%)",
  avgDiscountCents: "Reducere medie",
  totalDiscountCents: "Total reduceri",
  evaluationsConsidered: "Evaluări analizate",
  avgCostCents: "Cost mediu livrare",
  freeShippingShare: "Livrări gratuite (%)",
  totalCostCents: "Total costuri livrare",
  allowCount: "Permise",
  challengeCount: "Verificări (challenge)",
  reviewCount: "Verificări manuale",
  blockCount: "Blocate",
  blockedShare: "Pondere blocări (%)",
  avgRiskScore: "Scor de risc mediu",
  blockedCount: "Produse blocate",
  hiddenCount: "Produse ascunse",
  limitedCount: "Cu plafon de cantitate",
  totalPointsAwarded: "Total puncte acordate",
  extraPointsFromRules: "Puncte adăugate de reguli",
  avgPointsPerEvaluation: "Puncte medii / evaluare",
  boostedShare: "Evaluări cu bonus (%)",
  totalBonusPoints: "Puncte bonus acordate",
  avgPointsMultiplierX100: "Multiplicator mediu (×100)",
};

function formatAggregate(key: string, value: number, currency: string): string {
  if (key.endsWith("Cents")) return formatMoney(value, currency);
  return String(value);
}

const KIND_LABELS: Record<AiSuggestion["kind"], string> = {
  NEW_RULE: "regulă nouă",
  MODIFY_RULE: "modificare",
  DISABLE_RULE: "dezactivare",
  INFO: "observație",
};

const STATUS_BADGES: Record<
  AiSuggestion["status"],
  { label: string; tone?: "positive" | "caution" | "critical" | "accent" }
> = {
  PROPOSED: { label: "așteaptă decizia ta", tone: "caution" },
  ACCEPTED: { label: "acceptată", tone: "positive" },
  REJECTED: { label: "respinsă" },
  INVALID: { label: "invalidă", tone: "critical" },
};

function confidenceBadge(confidence: number) {
  const percent = Math.round(confidence * 100);
  if (confidence >= 0.7) return <Badge tone="positive">încredere {percent}%</Badge>;
  if (confidence >= 0.5) return <Badge tone="caution">încredere {percent}%</Badge>;
  return <Badge tone="critical">încredere scăzută · {percent}%</Badge>;
}

function SuggestionCard({
  suggestion,
  ruleNames,
}: {
  suggestion: AiSuggestion;
  ruleNames: Map<string, string>;
}) {
  const status = STATUS_BADGES[suggestion.status];
  const proposed = suggestion.proposedRule as unknown as EngineRule | null;
  const humanized = proposed
    ? tryHumanizeRule(proposed.conditions, proposed.actions)
    : null;
  const issues = (suggestion.validationIssues ?? []) as {
    path: string;
    message: string;
  }[];

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{KIND_LABELS[suggestion.kind]}</Badge>
        {confidenceBadge(suggestion.confidence)}
        <Badge tone={status.tone}>{status.label}</Badge>
        {suggestion.ruleKeys.length > 0 && (
          <span className="text-xs text-ink-faint">
            vizează: {suggestion.ruleKeys.map((k) => ruleNames.get(k) ?? k).join(", ")}
          </span>
        )}
      </div>

      <p className="mt-2 font-medium">{suggestion.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        {suggestion.explanation}
      </p>
      {suggestion.businessImpact && (
        <p className="mt-1.5 text-sm text-ink-muted">
          <span className="font-medium text-ink">Impact estimat (AI):</span>{" "}
          {suggestion.businessImpact}
        </p>
      )}

      {humanized && (
        <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-ink-muted">
          <span className="font-medium text-ink">DACĂ</span> {humanized.if}{" "}
          <span className="font-medium text-ink">ATUNCI</span> {humanized.then}
        </p>
      )}

      {issues.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-critical">
          {issues.map((issue) => (
            <li key={`${issue.path}-${issue.message}`}>
              {issue.path}: {issue.message}
            </li>
          ))}
        </ul>
      )}

      {suggestion.status === "PROPOSED" && (
        <div className="mt-3 flex items-center gap-2">
          <ActionForm
            action={acceptSuggestionAction}
            success={
              suggestion.kind === "INFO"
                ? "Observația a fost marcată ca citită."
                : "Aplicată ca DRAFT — intră în vigoare abia când publici."
            }
            error="Sugestia nu a putut fi aplicată — vezi validarea."
          >
            <input type="hidden" name="suggestionId" value={suggestion.id} />
            <button className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700">
              <Check className="size-3.5" strokeWidth={2} /> Acceptă
            </button>
          </ActionForm>
          <ActionForm
            action={rejectSuggestionAction}
            success="Sugestia a fost respinsă."
          >
            <input type="hidden" name="suggestionId" value={suggestion.id} />
            <button className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink">
              <X className="size-3.5" strokeWidth={2} /> Respinge
            </button>
          </ActionForm>
        </div>
      )}

      <p className="mt-3 text-xs text-ink-faint">
        {suggestion.model} · prompt v{suggestion.promptVersion} ·{" "}
        {new Intl.DateTimeFormat("ro-RO", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(suggestion.createdAt)}
      </p>
    </li>
  );
}

function MetricsColumn({
  title,
  tone,
  metrics,
  currency,
}: {
  title: string;
  tone: "positive" | "caution";
  metrics: SnapshotMetrics;
  currency: string;
}) {
  return (
    <div className="flex-1 rounded-lg border border-line bg-surface p-3">
      <Badge tone={tone}>{title}</Badge>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Evaluări cu reguli aplicate</dt>
          <dd className="font-medium tabular-nums">
            {metrics.matchedEvaluations}/{metrics.evaluations}
          </dd>
        </div>
        {Object.entries(metrics.aggregates).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3">
            <dt className="text-ink-muted">{AGGREGATE_LABELS[key] ?? key}</dt>
            <dd className="font-medium tabular-nums">
              {formatAggregate(key, value, currency)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * „Asistent IA" — panoul de pe pagina fiecarei categorii de reguli.
 *
 * Contine trei lucruri, in ordinea increderii:
 *  1. simularea pe evenimente istorice — cifre calculate de APLICATIE;
 *  2. statistici de utilizare per regula — tot ale aplicatiei;
 *  3. sugestiile IA (Gemini) — opinii, cu incredere afisata, care asteapta
 *     decizia unui om si devin cel mult DRAFT-uri.
 */
export async function AiPanel({
  storeId,
  category,
  hasDraftChanges,
  currency,
  ruleNames,
}: {
  storeId: string;
  category: DecisionCategory;
  hasDraftChanges: boolean;
  currency: string;
  ruleNames: Map<string, string>;
}) {
  const [events, active, candidate, suggestions] = await Promise.all([
    getEvaluationEvents(storeId, category, 1000),
    getActiveRuleset(storeId, category),
    buildCandidateSnapshot(storeId, category),
    listSuggestions(storeId, category, 12),
  ]);
  const stats = computeUsageStats(events);
  const configured = isAiConfigured();

  const simulation = events.length
    ? compareSnapshots(
        active?.snapshot ?? null,
        candidate,
        events.map((e) => ({ context: e.context as Record<string, unknown> })),
      )
    : null;

  const analyzeAction = runAiAnalysisAction.bind(null, category) as (
    prev: AiActionState | undefined,
    formData: FormData,
  ) => Promise<AiActionState>;

  const pending = suggestions.filter((s) => s.status === "PROPOSED");
  const decided = suggestions.filter((s) => s.status !== "PROPOSED").slice(0, 4);

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bot className="size-5 text-accent" strokeWidth={1.75} />
          Asistent AI
        </h2>
        {configured && <AiAnalyzeButton action={analyzeAction} />}
      </div>

      <div className="mt-3 space-y-4 rounded-xl border border-line bg-surface-raised p-4">
        {/* 1. Simularea pe istoric — cifrele aplicatiei, nu ale IA */}
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="size-4 text-accent" strokeWidth={1.75} />
            Simulare pe evenimente istorice
          </h3>
          {!simulation ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
              <History className="size-4 shrink-0" strokeWidth={1.75} />
              Încă nu există evaluări înregistrate — istoricul se construiește
              pe măsură ce clienții folosesc magazinul (pagini de produs, coș,
              checkout).
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-muted">
                {simulation.events} evaluări reale
                {stats.oldestEventAt &&
                  ` din ${new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(stats.oldestEventAt)}`}
                , re-evaluate cu versiunea activă și cu draftul curent.
                Valorile sunt calculate de aplicație.
              </p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                {simulation.active && (
                  <MetricsColumn
                    title="versiunea activă"
                    tone="positive"
                    metrics={simulation.active}
                    currency={currency}
                  />
                )}
                <MetricsColumn
                  title={hasDraftChanges ? "după publicare (draft)" : "draft curent"}
                  tone="caution"
                  metrics={simulation.candidate}
                  currency={currency}
                />
              </div>
              {hasDraftChanges &&
                simulation.active &&
                Object.values(simulation.aggregateDeltas).every((v) => v === 0) && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                    <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
                    Pe istoricul înregistrat, drafturile nu schimbă nicio metrică.
                  </p>
                )}
            </>
          )}
        </div>

        {/* 2. Sugestiile IA, cu aprobare umana obligatorie */}
        <div className="border-t border-line pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-accent" strokeWidth={1.75} />
            Sugestii de îmbunătățire
          </h3>

          {!configured ? (
            <p className="mt-2 text-sm text-ink-muted">
              Modulul AI nu este configurat. Setează{" "}
              <code className="rounded bg-zinc-100 px-1 font-mono text-xs">
                GEMINI_API_KEY
              </code>{" "}
              în <code className="rounded bg-zinc-100 px-1 font-mono text-xs">.env</code>{" "}
              pentru analiză, generare de reguli și clasificare de incidente.
            </p>
          ) : suggestions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">
              Nicio analiză încă. Apasă „Analizează cu AI&quot; — modelul primește
              regulile și statisticile calculate de aplicație și propune
              îmbunătățiri. Nimic nu se aplică fără aprobarea ta.
            </p>
          ) : (
            <>
              {pending.length > 0 && (
                <ul className="mt-2 space-y-3">
                  {pending.map((s) => (
                    <SuggestionCard key={s.id} suggestion={s} ruleNames={ruleNames} />
                  ))}
                </ul>
              )}
              {decided.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink">
                    Sugestii decise recent ({decided.length})
                  </summary>
                  <ul className="mt-2 space-y-3">
                    {decided.map((s) => (
                      <SuggestionCard key={s.id} suggestion={s} ruleNames={ruleNames} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
