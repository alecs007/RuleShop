import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DECISION_CATEGORIES, type DecisionCategory } from "@ruleshop/rule-engine";
import { authorizeAiApi } from "@/lib/ai/api-auth";
import {
  acceptSuggestion,
  listSuggestions,
  rejectSuggestion,
} from "@/lib/ai/suggestions";

/**
 * GET /api/v1/ai/suggestions?category= — sugestiile IA ale magazinului.
 * POST — decizia umana asupra unei sugestii: { suggestionId, decision }.
 * Chiar si prin API, „accept" produce cel mult un DRAFT — niciodata o publicare.
 */
export async function GET(request: NextRequest) {
  const actor = await authorizeAiApi(request);
  if (actor instanceof NextResponse) return actor;

  const raw = request.nextUrl.searchParams.get("category")?.toUpperCase();
  const category =
    raw && (DECISION_CATEGORIES as readonly string[]).includes(raw)
      ? (raw as DecisionCategory)
      : undefined;

  const suggestions = await listSuggestions(actor.storeId, category);
  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      category: s.category,
      kind: s.kind,
      status: s.status,
      title: s.title,
      explanation: s.explanation,
      businessImpact: s.businessImpact,
      confidence: s.confidence,
      ruleKeys: s.ruleKeys,
      proposedRule: s.proposedRule,
      validationIssues: s.validationIssues,
      model: s.model,
      createdAt: s.createdAt,
      decidedAt: s.decidedAt,
    })),
  });
}

const decisionSchema = z.object({
  suggestionId: z.string().min(1),
  decision: z.enum(["accept", "reject"]),
});

export async function POST(request: NextRequest) {
  const actor = await authorizeAiApi(request);
  if (actor instanceof NextResponse) return actor;

  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body invalid — trimite { suggestionId, decision }." },
      { status: 400 },
    );
  }

  const handler = parsed.data.decision === "accept" ? acceptSuggestion : rejectSuggestion;
  const result = await handler(actor.storeId, parsed.data.suggestionId, actor);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
