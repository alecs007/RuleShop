import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/audit";
import {
  validateRule,
  type DecisionCategory,
  type EngineRule,
  type ValidationIssue,
} from "@ruleshop/rule-engine";
import { getOrCreateRuleSet } from "@/lib/rules/service";
import { assertAiQuota, generateJson } from "./gemini";
import { describeCatalog, RULE_FORMAT_SPEC } from "./rule-catalog";

/**
 * Generarea unei reguli structurate dintr-o cerinta in limbaj natural.
 *
 * IA propune DOAR structura (conditii/actiuni din cataloagele motorului);
 * rezultatul trece prin `validateRule` — aceeasi validare ca la editarea
 * manuala — si devine cel mult un DRAFT pe care un om il publica explicit.
 */

const PROMPT_VERSION = 1;

const proposalParser = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  priority: z.number(),
  conditions: z.unknown(),
  actions: z
    .array(
      z.object({
        type: z.string().min(1),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(20),
  rationale: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
});

export interface RuleProposal {
  rule: EngineRule;
  rationale: string;
  /** 0..1 — autoevaluarea modelului; sub 0.5 UI-ul avertizeaza. */
  confidence: number;
  /** Problemele gasite de validarea aplicatiei (goale = valida). */
  issues: ValidationIssue[];
  model: string;
  promptVersion: number;
  rawText: string;
}

/** kebab-case sigur + unicitate fata de cheile existente. */
function normalizeKey(raw: string, existingKeys: Set<string>): string {
  let key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!key || !/^[a-z0-9]/.test(key)) key = `regula-${key || "noua"}`;
  let candidate = key;
  for (let i = 2; existingKeys.has(candidate); i++) candidate = `${key}-${i}`;
  return candidate;
}

const ALLOWED_PRIORITIES = new Set([50, 100, 500, 1000]);

export async function generateRuleProposal(input: {
  storeId: string;
  category: DecisionCategory;
  request: string;
  existingRuleKeys: string[];
}): Promise<RuleProposal> {
  await assertAiQuota(input.storeId, "generate");

  const system = `Ești asistentul de reguli al platformei RuleShop (magazin online cu rule engine propriu).
Transformi cerințe de business exprimate în limbaj natural în EXACT O regulă structurată JSON.
Reguli stricte:
- folosești DOAR faptele, operatorii și acțiunile din catalogul primit; nimic inventat;
- nu scrii cod, doar structura JSON cerută;
- "rationale" explică în română, pe scurt, ce face regula și de ce;
- "confidence" (0..1) reflectă cât de sigur ești că regula corespunde cerinței — fii onest, nu optimist;
- dacă cerința e ambiguă, alege interpretarea cea mai probabilă și spune în rationale ce ai presupus.

${RULE_FORMAT_SPEC}

Răspunde DOAR cu un obiect JSON: { "key", "name", "priority", "conditions", "actions", "rationale", "confidence" }.`;

  const user = `${describeCatalog(input.category)}

Chei de reguli deja folosite (evită-le): ${input.existingRuleKeys.join(", ") || "—"}

Cerința administratorului:
"""
${input.request.trim()}
"""`;

  const result = await generateJson({
    system,
    user,
    parser: proposalParser,
    temperature: 0.2,
  });

  const proposal = result.data;
  const rule: EngineRule = {
    key: normalizeKey(proposal.key, new Set(input.existingRuleKeys)),
    name: proposal.name.trim(),
    priority: ALLOWED_PRIORITIES.has(proposal.priority) ? proposal.priority : 100,
    enabled: true,
    conditions: proposal.conditions as EngineRule["conditions"],
    actions: proposal.actions.map((a) => ({ type: a.type, params: a.params ?? {} })),
  };

  // Aceeasi validare ca pentru regulile scrise de mana — IA nu are scurtaturi.
  const issues = validateRule(rule, input.category);

  return {
    rule,
    rationale: proposal.rationale.trim(),
    confidence: proposal.confidence,
    issues,
    model: result.model,
    promptVersion: PROMPT_VERSION,
    rawText: result.rawText,
  };
}

/**
 * Salveaza o propunere validata ca regula DRAFT — sursa AI_SUGGESTION, cu
 * motivatia si increderea pastrate pe regula. NU publica nimic: draftul intra
 * in vigoare doar prin fluxul manual de publicare. Folosita si de actiunea din
 * control plane si de API-ul consumat de serverul MCP.
 */
export async function createDraftFromProposal(input: {
  storeId: string;
  category: DecisionCategory;
  proposal: RuleProposal;
  request: string;
  actor: { id: string; email: string | null };
}): Promise<{ ruleId: string }> {
  const { proposal } = input;
  const errors = proposal.issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new Error(`Regula propusă nu este validă: ${errors[0]!.message}`);
  }

  const ruleSet = await getOrCreateRuleSet(input.storeId, input.category);
  const rule = await prisma.rule.create({
    data: {
      storeId: input.storeId,
      ruleSetId: ruleSet.id,
      key: proposal.rule.key,
      name: proposal.rule.name,
      description: `Generată din cerința: „${input.request}"`,
      priority: proposal.rule.priority,
      status: "DRAFT",
      enabled: true,
      conditions: proposal.rule.conditions as unknown as Prisma.InputJsonValue,
      actions: proposal.rule.actions as unknown as Prisma.InputJsonValue,
      source: "AI_SUGGESTION",
      aiRationale: proposal.rationale,
      aiConfidence: proposal.confidence,
      createdById: input.actor.id.startsWith("mcp-") ? null : input.actor.id,
    },
  });
  await logAudit({
    storeId: input.storeId,
    action: "AI_SUGGESTION_GENERATED",
    entityType: "Rule",
    entityId: rule.id,
    actorId: input.actor.id.startsWith("mcp-") ? null : input.actor.id,
    actorEmail: input.actor.email,
    metadata: {
      feature: "generate-rule",
      category: input.category,
      model: proposal.model,
      promptVersion: proposal.promptVersion,
      confidence: proposal.confidence,
      request: input.request,
    },
  });
  return { ruleId: rule.id };
}
