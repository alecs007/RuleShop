import "server-only";
import { Prisma, type AiSuggestion } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/audit";
import { validateRule, type DecisionCategory, type EngineRule } from "@ruleshop/rule-engine";
import { getOrCreateRuleSet } from "@/lib/rules/service";

/**
 * The lifecycle of AI suggestions, with mandatory human control. Accepting one
 * publishes nothing: at most it creates or edits a DRAFT rule, which takes
 * effect only through the existing manual publish. Rejecting keeps the
 * suggestion in the history, for audit.
 */

export async function listSuggestions(
  storeId: string,
  category?: DecisionCategory,
  limit = 50,
): Promise<AiSuggestion[]> {
  return prisma.aiSuggestion.findMany({
    where: { storeId, ...(category ? { category } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export interface DecisionResult {
  ok: boolean;
  message: string;
  /** The DRAFT rule created or edited, if any. */
  ruleId?: string;
}

interface Actor {
  id: string;
  email: string | null;
}

/** The suggestion, only if it belongs to the store and is still pending. */
async function findPending(
  storeId: string,
  suggestionId: string,
): Promise<AiSuggestion | null> {
  const suggestion = await prisma.aiSuggestion.findFirst({
    where: { id: suggestionId, storeId },
  });
  return suggestion && suggestion.status === "PROPOSED" ? suggestion : null;
}

export async function acceptSuggestion(
  storeId: string,
  suggestionId: string,
  actor: Actor,
): Promise<DecisionResult> {
  const suggestion = await findPending(storeId, suggestionId);
  if (!suggestion) {
    return { ok: false, message: "Sugestia nu există sau a fost deja decisă." };
  }

  let ruleId: string | undefined;

  if (suggestion.kind === "NEW_RULE" || suggestion.kind === "MODIFY_RULE") {
    const proposed = suggestion.proposedRule as unknown as EngineRule | null;
    if (!proposed) return { ok: false, message: "Sugestia nu conține o regulă." };

    // Re-validated on apply: the rules or the catalog may have moved since.
    const issues = validateRule(proposed, suggestion.category).filter(
      (i) => i.severity === "error",
    );
    if (issues.length > 0) {
      return {
        ok: false,
        message: `Regula propusă nu mai trece validarea: ${issues[0]!.message}`,
      };
    }

    const ruleSet = await getOrCreateRuleSet(storeId, suggestion.category);

    if (suggestion.kind === "NEW_RULE") {
      const existing = await prisma.rule.findUnique({
        where: { ruleSetId_key: { ruleSetId: ruleSet.id, key: proposed.key } },
      });
      if (existing) {
        return {
          ok: false,
          message: `Există deja o regulă cu cheia „${proposed.key}".`,
        };
      }
      const rule = await prisma.rule.create({
        data: {
          storeId,
          ruleSetId: ruleSet.id,
          key: proposed.key,
          name: proposed.name,
          priority: proposed.priority,
          status: "DRAFT",
          enabled: true,
          conditions: proposed.conditions as unknown as Prisma.InputJsonValue,
          actions: proposed.actions as unknown as Prisma.InputJsonValue,
          source: "AI_SUGGESTION",
          aiRationale: suggestion.explanation,
          aiConfidence: suggestion.confidence,
          createdById: actor.id,
        },
      });
      ruleId = rule.id;
    } else {
      const targetKey = suggestion.ruleKeys[0] ?? proposed.key;
      const target = await prisma.rule.findUnique({
        where: { ruleSetId_key: { ruleSetId: ruleSet.id, key: targetKey } },
      });
      if (!target) {
        return { ok: false, message: `Regula „${targetKey}" nu mai există.` };
      }
      const rule = await prisma.rule.update({
        where: { id: target.id },
        data: {
          name: proposed.name,
          priority: proposed.priority,
          conditions: proposed.conditions as unknown as Prisma.InputJsonValue,
          actions: proposed.actions as unknown as Prisma.InputJsonValue,
          status: "DRAFT",
          source: "AI_SUGGESTION",
          aiRationale: suggestion.explanation,
          aiConfidence: suggestion.confidence,
        },
      });
      ruleId = rule.id;
    }
  } else if (suggestion.kind === "DISABLE_RULE") {
    if (suggestion.ruleKeys.length === 0) {
      return { ok: false, message: "Sugestia nu numește nicio regulă." };
    }
    const ruleSet = await getOrCreateRuleSet(storeId, suggestion.category);
    await prisma.rule.updateMany({
      where: { ruleSetId: ruleSet.id, key: { in: suggestion.ruleKeys } },
      data: { enabled: false, status: "DRAFT" },
    });
  }
  // INFO: nothing to apply; accepting only records that it was read.

  await prisma.aiSuggestion.update({
    where: { id: suggestion.id },
    data: {
      status: "ACCEPTED",
      decidedById: actor.id,
      decidedAt: new Date(),
      appliedRuleId: ruleId ?? null,
    },
  });
  await logAudit({
    storeId,
    action: "AI_SUGGESTION_APPROVED",
    entityType: "AiSuggestion",
    entityId: suggestion.id,
    actorId: actor.id,
    actorEmail: actor.email,
    metadata: {
      category: suggestion.category,
      kind: suggestion.kind,
      ruleKeys: suggestion.ruleKeys,
      appliedRuleId: ruleId ?? null,
    },
  });

  return {
    ok: true,
    ruleId,
    message:
      suggestion.kind === "INFO"
        ? "Observația a fost marcată ca citită."
        : "Sugestia a fost aplicată ca DRAFT — intră în vigoare abia la publicare.",
  };
}

export async function rejectSuggestion(
  storeId: string,
  suggestionId: string,
  actor: Actor,
): Promise<DecisionResult> {
  const suggestion = await findPending(storeId, suggestionId);
  if (!suggestion) {
    return { ok: false, message: "Sugestia nu există sau a fost deja decisă." };
  }

  await prisma.aiSuggestion.update({
    where: { id: suggestion.id },
    data: { status: "REJECTED", decidedById: actor.id, decidedAt: new Date() },
  });
  await logAudit({
    storeId,
    action: "AI_SUGGESTION_REJECTED",
    entityType: "AiSuggestion",
    entityId: suggestion.id,
    actorId: actor.id,
    actorEmail: actor.email,
    metadata: { category: suggestion.category, kind: suggestion.kind },
  });

  return { ok: true, message: "Sugestia a fost respinsă." };
}
