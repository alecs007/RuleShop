import "server-only";
import { Prisma, type DecisionCategory, type EvaluationEvent } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/redis/rate-limit";

/**
 * Istoricul evaluarilor motorului — evenimente REALE din magazin, cu contextul
 * complet de fapte. Pe ele se sprijina:
 *  - istoricul consultabil al deciziilor (cine, cand, ce reguli au contribuit);
 *  - simularea versiunilor candidat (lib/rules/simulation.ts) — aplicatia
 *    re-evalueaza contextele stocate si isi calculeaza singura statisticile,
 *    exact cum cere baremul (nu le declara serviciul IA);
 *  - statisticile de utilizare per regula pe care se bazeaza analiza IA.
 */

/** Plafon de scriere per magazin+categorie — istoricul nu trebuie sa explodeze. */
const MAX_EVENTS_PER_MINUTE = 120;

/** Cate evenimente se pastreaza/citesc cel mult pentru statistici si simulare. */
export const EVENT_SAMPLE_LIMIT = 2000;

export interface RecordEvaluationInput {
  storeId: string;
  category: DecisionCategory;
  /** Contextul de fapte EXACT cum a intrat in motor — suficient pentru replay. */
  context: Record<string, unknown>;
  /** Rezumatul deciziei finale (forma categoriei), pentru istoric. */
  decision: Record<string, unknown>;
  matchedRuleKeys: string[];
  rulesetVersion: number;
  traceId: string | null;
  usedDefault: boolean;
  /** De unde vine evenimentul: product-page | cart | checkout. */
  source: string;
}

/** Emailul nu are ce cauta in istoricul de evaluari; domeniul ramane (fact FRAUD). */
function stripPii(context: Record<string, unknown>): Record<string, unknown> {
  const customer = context.customer;
  if (typeof customer !== "object" || customer === null) return context;
  const rest = { ...(customer as Record<string, unknown>) };
  delete rest.email;
  delete rest.id;
  return { ...context, customer: rest };
}

/**
 * Inregistreaza o evaluare, fire-and-forget: magazinul nu asteapta si nu pica
 * niciodata din cauza istoricului. Plafonat prin Redis (fail-open).
 */
export function recordEvaluation(input: RecordEvaluationInput): void {
  void (async () => {
    const gate = await rateLimit({
      key: `eval:${input.storeId}:${input.category}`,
      limit: MAX_EVENTS_PER_MINUTE,
      windowSeconds: 60,
    });
    if (!gate.allowed) return;

    await prisma.evaluationEvent.create({
      data: {
        storeId: input.storeId,
        category: input.category,
        rulesetVersion: input.rulesetVersion,
        traceId: input.traceId,
        matchedRuleKeys: input.matchedRuleKeys,
        decision: input.decision as Prisma.InputJsonValue,
        context: stripPii(input.context) as Prisma.InputJsonValue,
        usedDefault: input.usedDefault,
        source: input.source,
      },
    });
  })().catch((error) => {
    console.warn("[evaluation-log] scrierea a esuat:", error);
  });
}

/** Cele mai recente evaluari ale unei categorii (pentru istoric si simulare). */
export async function getEvaluationEvents(
  storeId: string,
  category: DecisionCategory,
  limit = EVENT_SAMPLE_LIMIT,
): Promise<EvaluationEvent[]> {
  return prisma.evaluationEvent.findMany({
    where: { storeId, category },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export interface RuleUsage {
  matched: number;
  lastMatchedAt: Date | null;
}

export interface UsageStats {
  /** Cate evaluari reale acopera statisticile. */
  evaluations: number;
  oldestEventAt: Date | null;
  newestEventAt: Date | null;
  /** Cheia regulii -> de cate ori a contribuit la decizie. */
  perRule: Record<string, RuleUsage>;
}

/**
 * Statistici de utilizare per regula, calculate in aplicatie din evenimente.
 * O regula din snapshot care nu apare aici nu s-a potrivit niciodata in
 * fereastra analizata — candidat de "regula neutilizata".
 */
export function computeUsageStats(events: EvaluationEvent[]): UsageStats {
  const perRule: Record<string, RuleUsage> = {};
  for (const event of events) {
    for (const key of event.matchedRuleKeys) {
      const entry = (perRule[key] ??= { matched: 0, lastMatchedAt: null });
      entry.matched += 1;
      if (!entry.lastMatchedAt || event.createdAt > entry.lastMatchedAt) {
        entry.lastMatchedAt = event.createdAt;
      }
    }
  }
  const times = events.map((e) => e.createdAt.getTime());
  return {
    evaluations: events.length,
    oldestEventAt: times.length ? new Date(Math.min(...times)) : null,
    newestEventAt: times.length ? new Date(Math.max(...times)) : null,
    perRule,
  };
}
