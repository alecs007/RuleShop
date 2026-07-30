import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { DECISION_CATEGORIES } from "@/lib/engine";
import { getOrCreateRuleSet } from "@/lib/rules/service";
import { authorizeAiApi } from "@/lib/ai/api-auth";
import {
  createDraftFromProposal,
  generateRuleProposal,
} from "@/lib/ai/generate-rule";
import {
  AiInvalidResponseError,
  AiNotConfiguredError,
  AiRequestError,
} from "@/lib/ai/gemini";

const bodySchema = z.object({
  category: z.enum(DECISION_CATEGORIES),
  request: z.string().trim().min(10).max(1000),
  /** true => doar propunerea, fara sa creeze draftul. */
  dryRun: z.boolean().default(false),
});

/**
 * POST /api/v1/ai/generate-rule — cerinta in limbaj natural -> regula
 * structurata, validata de motor. Fara `dryRun`, propunerea valida devine o
 * regula DRAFT (nepublicata); publicarea ramane exclusiv manuala.
 */
export async function POST(request: NextRequest) {
  const actor = await authorizeAiApi(request);
  if (actor instanceof NextResponse) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body invalid — trimite { category, request, dryRun? }." },
      { status: 400 },
    );
  }

  const ruleSet = await getOrCreateRuleSet(actor.storeId, parsed.data.category);
  const existing = await prisma.rule.findMany({
    where: { ruleSetId: ruleSet.id },
    select: { key: true },
  });

  try {
    const proposal = await generateRuleProposal({
      storeId: actor.storeId,
      category: parsed.data.category,
      request: parsed.data.request,
      existingRuleKeys: existing.map((r) => r.key),
    });

    const valid = !proposal.issues.some((i) => i.severity === "error");
    let draftRuleId: string | null = null;
    if (valid && !parsed.data.dryRun) {
      const created = await createDraftFromProposal({
        storeId: actor.storeId,
        category: parsed.data.category,
        proposal,
        request: parsed.data.request,
        actor,
      });
      draftRuleId = created.ruleId;
    }

    return NextResponse.json({
      valid,
      rule: proposal.rule,
      rationale: proposal.rationale,
      confidence: proposal.confidence,
      issues: proposal.issues,
      model: proposal.model,
      draftRuleId,
      note: draftRuleId
        ? "Regula a fost salvată ca DRAFT — intră în vigoare doar după publicarea manuală."
        : "Nicio regulă salvată.",
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
