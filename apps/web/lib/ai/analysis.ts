import "server-only";
import { createHash, randomUUID } from "crypto";
import { Prisma, type AiSuggestion } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/audit";
import {
  validateRule,
  type DecisionCategory,
  type EngineRule,
  type RuleSetSnapshot,
} from "@ruleshop/rule-engine";
import { z } from "zod";
import { buildCandidateSnapshot, getActiveRuleset } from "@/lib/rules/service";
import {
  computeUsageStats,
  getEvaluationEvents,
  type UsageStats,
} from "@/lib/rules/evaluation-log";
import { compareSnapshots, type SimulationComparison } from "@/lib/rules/simulation";
import { tryHumanizeRule } from "@/lib/rules/humanize";
import { assertAiQuota, generateJson } from "./gemini";
import { describeCatalog, RULE_FORMAT_SPEC } from "./rule-catalog";

/**
 * AI-assisted ruleset analysis, with the split of responsibilities that makes
 * it trustworthy: the application computes everything measurable (per-rule
 * usage, duplicate conditions, the simulation over history), the AI only
 * interprets those numbers and proposes changes, and every proposal goes
 * through engine validation and waits for a human — accepting one yields a
 * DRAFT at most.
 */

const PROMPT_VERSION = 1;
const MAX_SUGGESTIONS = 8;
/** Below this many evaluations, "unused rule" means nothing. */
const MIN_EVENTS_FOR_USAGE = 10;

const suggestionParser = z.object({
  suggestions: z
    .array(
      z.object({
        kind: z.enum(["NEW_RULE", "MODIFY_RULE", "DISABLE_RULE", "INFO"]),
        title: z.string().min(1).max(200),
        explanation: z.string().min(1).max(3000),
        businessImpact: z.string().max(1500).default(""),
        confidence: z.number().min(0).max(1),
        ruleKeys: z.array(z.string()).max(10).default([]),
        proposedRule: z.unknown().optional(),
      }),
    )
    .max(MAX_SUGGESTIONS),
});

export interface DeterministicFindings {
  /** Enabled rules with no match in the window analysed. */
  unusedRuleKeys: string[];
  /** Groups of rules with identical condition trees. */
  duplicateConditionGroups: string[][];
  /** Disabled rules that are only dead weight. */
  disabledRuleKeys: string[];
}

/** What the application can demonstrate on its own, without the AI. */
export function computeDeterministicFindings(
  snapshot: RuleSetSnapshot,
  stats: UsageStats,
): DeterministicFindings {
  const unusedRuleKeys =
    stats.evaluations >= MIN_EVENTS_FOR_USAGE
      ? snapshot.rules
          .filter((r) => r.enabled && !stats.perRule[r.key])
          .map((r) => r.key)
      : [];

  const byConditions = new Map<string, string[]>();
  for (const rule of snapshot.rules) {
    const signature = JSON.stringify(rule.conditions);
    byConditions.set(signature, [...(byConditions.get(signature) ?? []), rule.key]);
  }
  const duplicateConditionGroups = [...byConditions.values()].filter(
    (keys) => keys.length > 1,
  );

  return {
    unusedRuleKeys,
    duplicateConditionGroups,
    disabledRuleKeys: snapshot.rules.filter((r) => !r.enabled).map((r) => r.key),
  };
}

export interface AnalysisRun {
  runId: string;
  suggestions: AiSuggestion[];
  stats: UsageStats;
  findings: DeterministicFindings;
  simulation: SimulationComparison | null;
  model: string;
}

function digestOf(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function runRulesetAnalysis(
  storeId: string,
  category: DecisionCategory,
  actor: { id: string; email: string | null },
): Promise<AnalysisRun> {
  await assertAiQuota(storeId, "analyze");

  // 1) The data the application computes.
  const [candidate, active, events] = await Promise.all([
    buildCandidateSnapshot(storeId, category),
    getActiveRuleset(storeId, category),
    getEvaluationEvents(storeId, category),
  ]);
  const stats = computeUsageStats(events);
  const analyzed = active?.snapshot ?? candidate;
  const findings = computeDeterministicFindings(analyzed, stats);
  const simulation = events.length
    ? compareSnapshots(
        active?.snapshot ?? null,
        candidate,
        events.map((e) => ({ context: e.context as Record<string, unknown> })),
      )
    : null;

  // 2) The AI's interpretation.
  const rulesForPrompt = candidate.rules.map((rule) => {
    const usage = stats.perRule[rule.key];
    const text = tryHumanizeRule(rule.conditions, rule.actions);
    return {
      ...rule,
      humanized: text ? `DACĂ ${text.if} ATUNCI ${text.then}` : null,
      usage: usage
        ? { matched: usage.matched, lastMatchedAt: usage.lastMatchedAt }
        : { matched: 0, lastMatchedAt: null },
    };
  });

  const system = `Ești analistul de reguli al platformei RuleShop. Primești regulile unei categorii de decizie, statistici de utilizare din evaluări REALE și metrici de simulare — toate calculate de aplicație.
Sarcina ta: propuneri concrete de îmbunătățire, în română, pentru un administrator NEtehnic.
Reguli stricte:
- NU inventezi cifre: orice număr pe care îl menționezi vine din datele primite; impactul de business este o ESTIMARE și o formulezi ca atare;
- fiecare propunere are "kind": NEW_RULE (regulă nouă, cu "proposedRule" complet), MODIFY_RULE (înlocuiește regula din "ruleKeys[0]" cu "proposedRule"), DISABLE_RULE (dezactivează "ruleKeys"), INFO (observație fără acțiune);
- pentru NEW_RULE și MODIFY_RULE, "proposedRule" respectă STRICT formatul și cataloagele primite;
- "confidence" (0..1) — onest: statistici puține sau ipoteze multe înseamnă încredere mică;
- maximum ${MAX_SUGGESTIONS} propuneri, doar cele care chiar merită; lista poate fi și goală.

${RULE_FORMAT_SPEC}

Răspunde DOAR cu JSON: { "suggestions": [ { "kind", "title", "explanation", "businessImpact", "confidence", "ruleKeys", "proposedRule"? } ] }.`;

  const promptPayload = {
    category,
    conflictStrategy: candidate.conflictStrategy,
    rules: rulesForPrompt,
    usage: {
      evaluations: stats.evaluations,
      window:
        stats.oldestEventAt && stats.newestEventAt
          ? { from: stats.oldestEventAt, to: stats.newestEventAt }
          : null,
    },
    deterministicFindings: findings,
    simulation: simulation
      ? {
          events: simulation.events,
          activeAggregates: simulation.active?.aggregates ?? null,
          candidateAggregates: simulation.candidate.aggregates,
          aggregateDeltas: simulation.aggregateDeltas,
        }
      : null,
  };

  const user = `${describeCatalog(category)}

Datele analizei (calculate de aplicație):
${JSON.stringify(promptPayload, null, 2)}`;

  const result = await generateJson({
    system,
    user,
    parser: suggestionParser,
    temperature: 0.3,
  });

  // 3) Validation and persistence, with full traceability.
  const runId = randomUUID();
  const inputDigest = digestOf(promptPayload);
  const existingKeys = new Set(candidate.rules.map((r) => r.key));

  const created: AiSuggestion[] = [];
  for (const suggestion of result.data.suggestions) {
    let proposedRule: EngineRule | null = null;
    let validationIssues: { path: string; message: string }[] = [];

    if (suggestion.kind === "NEW_RULE" || suggestion.kind === "MODIFY_RULE") {
      proposedRule = suggestion.proposedRule as EngineRule | null;
      if (!proposedRule) {
        validationIssues = [{ path: "proposedRule", message: "Lipsește regula propusă." }];
      } else {
        if (suggestion.kind === "NEW_RULE" && existingKeys.has(proposedRule.key)) {
          proposedRule = { ...proposedRule, key: `${proposedRule.key}-ai` };
        }
        validationIssues = validateRule(proposedRule, category)
          .filter((i) => i.severity === "error")
          .map(({ path, message }) => ({ path, message }));
      }
    }

    const row = await prisma.aiSuggestion.create({
      data: {
        storeId,
        category,
        kind: suggestion.kind,
        status: validationIssues.length > 0 ? "INVALID" : "PROPOSED",
        title: suggestion.title,
        explanation: suggestion.explanation,
        businessImpact: suggestion.businessImpact,
        confidence: suggestion.confidence,
        ruleKeys: suggestion.ruleKeys,
        proposedRule: proposedRule
          ? (proposedRule as unknown as Prisma.InputJsonValue)
          : null,
        validationIssues: validationIssues as unknown as Prisma.InputJsonValue,
        model: result.model,
        promptVersion: PROMPT_VERSION,
        inputDigest,
        usageStats: {
          evaluations: stats.evaluations,
          perRule: stats.perRule,
        } as unknown as Prisma.InputJsonValue,
        rawResponse: { text: result.rawText.slice(0, 20_000) } as Prisma.InputJsonValue,
        analysisRunId: runId,
        createdById: actor.id,
      },
    });
    created.push(row);
  }

  await logAudit({
    storeId,
    action: "AI_SUGGESTION_GENERATED",
    entityType: "AiSuggestion",
    entityId: runId,
    actorId: actor.id,
    actorEmail: actor.email,
    metadata: {
      category,
      model: result.model,
      promptVersion: PROMPT_VERSION,
      inputDigest,
      suggestions: created.length,
      invalid: created.filter((s) => s.status === "INVALID").length,
      latencyMs: result.latencyMs,
    },
  });

  return {
    runId,
    suggestions: created,
    stats,
    findings,
    simulation,
    model: result.model,
  };
}
