import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DECISION_CATEGORIES } from "@ruleshop/rule-engine";
import { authorizeAiApi } from "@/lib/ai/api-auth";
import { runRulesetAnalysis } from "@/lib/ai/analysis";
import {
  AiInvalidResponseError,
  AiNotConfiguredError,
  AiRequestError,
} from "@/lib/ai/gemini";

const bodySchema = z.object({ category: z.enum(DECISION_CATEGORIES) });

/**
 * Runs the AI analysis of a ruleset and returns the persisted suggestions with
 * their validation status. Authorized by an admin session or the MCP token.
 */
export async function POST(request: NextRequest) {
  const actor = await authorizeAiApi(request);
  if (actor instanceof NextResponse) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body invalid — trimite { category }." },
      { status: 400 },
    );
  }

  try {
    const run = await runRulesetAnalysis(actor.storeId, parsed.data.category, actor);
    return NextResponse.json({
      runId: run.runId,
      model: run.model,
      usage: {
        evaluations: run.stats.evaluations,
        perRule: run.stats.perRule,
      },
      findings: run.findings,
      simulation: run.simulation,
      suggestions: run.suggestions.map((s) => ({
        id: s.id,
        kind: s.kind,
        status: s.status,
        title: s.title,
        explanation: s.explanation,
        businessImpact: s.businessImpact,
        confidence: s.confidence,
        ruleKeys: s.ruleKeys,
        proposedRule: s.proposedRule,
        validationIssues: s.validationIssues,
      })),
    });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof AiRequestError || error instanceof AiInvalidResponseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
