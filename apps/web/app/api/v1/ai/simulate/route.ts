import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DECISION_CATEGORIES } from "@ruleshop/rule-engine";
import { authorizeAiApi } from "@/lib/ai/api-auth";
import { buildCandidateSnapshot, getActiveRuleset } from "@/lib/rules/service";
import {
  computeUsageStats,
  getEvaluationEvents,
} from "@/lib/rules/evaluation-log";
import { compareSnapshots } from "@/lib/rules/simulation";

const bodySchema = z.object({
  category: z.enum(DECISION_CATEGORIES),
  limit: z.number().int().min(1).max(2000).default(1000),
});

/**
 * Simulates the current draft against the active version over the recorded
 * history. No AI involved: the application computes it with its own engine.
 */
export async function POST(request: NextRequest) {
  const actor = await authorizeAiApi(request);
  if (actor instanceof NextResponse) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body invalid — trimite { category, limit? }." },
      { status: 400 },
    );
  }

  const [events, active, candidate] = await Promise.all([
    getEvaluationEvents(actor.storeId, parsed.data.category, parsed.data.limit),
    getActiveRuleset(actor.storeId, parsed.data.category),
    buildCandidateSnapshot(actor.storeId, parsed.data.category),
  ]);

  if (events.length === 0) {
    return NextResponse.json({
      events: 0,
      note: "Nu există evaluări istorice — istoricul se construiește pe măsură ce magazinul este folosit.",
    });
  }

  const comparison = compareSnapshots(
    active?.snapshot ?? null,
    candidate,
    events.map((e) => ({ context: e.context as Record<string, unknown> })),
  );

  return NextResponse.json({
    ...comparison,
    usage: computeUsageStats(events),
    activeVersion: active?.snapshot.version ?? null,
    candidateVersion: candidate.version,
  });
}
