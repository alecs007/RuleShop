import "server-only";
import { Prisma, type DecisionCategory, type EvaluationEvent } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Real storefront evaluations with their full fact context. They back the
 * decision history, the simulation of candidate versions, and the per-rule
 * usage statistics the AI analysis reasons about.
 */

/** How many events statistics and simulation read at most. */
export const EVENT_SAMPLE_LIMIT = 2000;

export interface RecordEvaluationInput {
  storeId: string;
  category: DecisionCategory;
  /** The fact context exactly as the engine saw it: enough to replay. */
  context: Record<string, unknown>;
  /** A summary of the final decision, for the history. */
  decision: Record<string, unknown>;
  matchedRuleKeys: string[];
  rulesetVersion: number;
  traceId: string | null;
  usedDefault: boolean;
  /** Where the event came from: product-page | cart | checkout. */
  source: string;
}

/** The email has no place in the history; the domain stays, as a FRAUD fact. */
function stripPii(context: Record<string, unknown>): Record<string, unknown> {
  const customer = context.customer;
  if (typeof customer !== "object" || customer === null) return context;
  const rest = { ...(customer as Record<string, unknown>) };
  delete rest.email;
  delete rest.id;
  return { ...context, customer: rest };
}

/** Fire-and-forget: the storefront never waits on, or fails because of, history. */
export function recordEvaluation(input: RecordEvaluationInput): void {
  void (async () => {
    const gate = await rateLimit(
      "evaluationLog",
      `${input.storeId}:${input.category}`,
    );
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

/** The most recent evaluations for a category. */
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
  /** How many real evaluations the statistics cover. */
  evaluations: number;
  oldestEventAt: Date | null;
  newestEventAt: Date | null;
  /** Rule key -> how often it reached the decision. */
  perRule: Record<string, RuleUsage>;
}

/**
 * A rule in the snapshot that does not appear here never matched in the
 * window analysed — a candidate for "unused rule".
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
