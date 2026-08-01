import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { DECISION_CATEGORIES, type DecisionCategory } from "@ruleshop/rule-engine";
import { authorizeAiApi } from "@/lib/ai/api-auth";
import {
  computeUsageStats,
  getEvaluationEvents,
} from "@/lib/rules/evaluation-log";
import { tryHumanizeRule } from "@/lib/rules/humanize";

/**
 * GET /api/v1/rules?category= — regulile magazinului cu statistici de
 * utilizare din evaluari reale. Consumat de serverul MCP (tool `list_rules`).
 */
export async function GET(request: NextRequest) {
  const actor = await authorizeAiApi(request);
  if (actor instanceof NextResponse) return actor;

  const raw = request.nextUrl.searchParams.get("category")?.toUpperCase();
  const category =
    raw && (DECISION_CATEGORIES as readonly string[]).includes(raw)
      ? (raw as DecisionCategory)
      : undefined;

  const [ruleSets, rules] = await Promise.all([
    prisma.ruleSet.findMany({
      where: { storeId: actor.storeId, ...(category ? { category } : {}) },
      include: { activeVersion: { select: { version: true, publishedAt: true } } },
    }),
    prisma.rule.findMany({
      where: { storeId: actor.storeId, ...(category ? { ruleSet: { category } } : {}) },
      orderBy: { priority: "desc" },
      include: { ruleSet: { select: { category: true } } },
    }),
  ]);

  const usageByCategory = new Map<DecisionCategory, ReturnType<typeof computeUsageStats>>();
  for (const set of ruleSets) {
    const events = await getEvaluationEvents(actor.storeId, set.category, 1000);
    usageByCategory.set(set.category, computeUsageStats(events));
  }

  return NextResponse.json({
    ruleSets: ruleSets.map((set) => ({
      category: set.category,
      conflictStrategy: set.conflictStrategy,
      killSwitch: set.killSwitch,
      activeVersion: set.activeVersion?.version ?? null,
      publishedAt: set.activeVersion?.publishedAt ?? null,
      evaluations: usageByCategory.get(set.category)?.evaluations ?? 0,
    })),
    rules: rules.map((rule) => {
      const text = tryHumanizeRule(rule.conditions, rule.actions);
      const usage = usageByCategory.get(rule.ruleSet.category)?.perRule[rule.key];
      return {
        key: rule.key,
        name: rule.name,
        category: rule.ruleSet.category,
        priority: rule.priority,
        enabled: rule.enabled,
        status: rule.status,
        source: rule.source,
        humanized: text ? `DACĂ ${text.if} ATUNCI ${text.then}` : null,
        conditions: rule.conditions,
        actions: rule.actions,
        usage: usage ?? { matched: 0, lastMatchedAt: null },
      };
    }),
  });
}
