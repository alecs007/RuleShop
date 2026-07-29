"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/utils/slug";
import {
  CONFLICT_STRATEGIES,
  DECISION_CATEGORIES,
  validateRule,
  type ConditionNode,
  type DecisionCategory,
  type EngineRule,
  type RuleAction,
} from "@/lib/engine";
import {
  getOrCreateRuleSet,
  publishVersion,
  rollbackToVersion,
  setKillSwitch,
} from "@/lib/rules/service";

function parseCategory(raw: unknown): DecisionCategory {
  const value = String(raw ?? "").toUpperCase() as DecisionCategory;
  if (!DECISION_CATEGORIES.includes(value)) redirect("/admin/rules");
  return value;
}

// ---------------------------------------------------------------------------
// Salvare regula (creare / editare)
// ---------------------------------------------------------------------------

const ruleFormSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  priority: z.coerce.number().int().min(0).max(10000),
  enabled: z.coerce.boolean(),
  conditionsJson: z.string().min(2),
  actionsJson: z.string().min(2),
});

export interface RuleFormState {
  ok: boolean;
  message?: string;
  issues?: string[];
}

export async function saveRuleAction(
  category: string,
  ruleId: string | null,
  _prev: RuleFormState | undefined,
  formData: FormData,
): Promise<RuleFormState> {
  const { user, storeId } = await requireAdmin();
  const cat = parseCategory(category);

  const parsed = ruleFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    priority: formData.get("priority"),
    enabled: formData.get("enabled") === "on",
    conditionsJson: formData.get("conditionsJson"),
    actionsJson: formData.get("actionsJson"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Formular invalid.",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  let conditions: ConditionNode;
  let actions: RuleAction[];
  try {
    conditions = JSON.parse(parsed.data.conditionsJson);
    actions = JSON.parse(parsed.data.actionsJson);
  } catch {
    return { ok: false, message: "Condițiile sau acțiunile nu sunt JSON valid." };
  }

  const ruleSet = await getOrCreateRuleSet(storeId, cat);

  const existing = ruleId
    ? await prisma.rule.findFirst({
        where: { id: ruleId, storeId, ruleSetId: ruleSet.id },
      })
    : null;
  if (ruleId && !existing) return { ok: false, message: "Regula nu există." };

  let key = existing?.key ?? slugify(parsed.data.name);
  if (!existing) {
    // asigura unicitatea cheii in ruleset
    const clash = await prisma.rule.findUnique({
      where: { ruleSetId_key: { ruleSetId: ruleSet.id, key } },
    });
    if (clash) key = `${key}-${Date.now().toString(36).slice(-4)}`;
  }

  // Validarea completa a regulii prin motor (structura + semantica +
  // compatibilitatea operatorilor si actiunilor cu categoria).
  const engineRule: EngineRule = {
    key,
    name: parsed.data.name,
    priority: parsed.data.priority,
    enabled: parsed.data.enabled,
    conditions,
    actions,
  };
  const issues = validateRule(engineRule, cat).filter((i) => i.severity === "error");
  if (issues.length > 0) {
    return {
      ok: false,
      message: "Regula nu este validă.",
      issues: issues.map((i) => `${i.path}: ${i.message}`),
    };
  }

  const data = {
    name: parsed.data.name,
    description: parsed.data.description ?? "",
    priority: parsed.data.priority,
    enabled: parsed.data.enabled,
    conditions: conditions as unknown as Prisma.InputJsonValue,
    actions: actions as unknown as Prisma.InputJsonValue,
    status: "DRAFT" as const, // modificarile devin ACTIVE abia la publicare
  };

  if (existing) {
    await prisma.rule.update({ where: { id: existing.id }, data });
    await logAudit({
      storeId,
      action: "RULE_UPDATED",
      entityType: "Rule",
      entityId: existing.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      before: { conditions: existing.conditions, actions: existing.actions },
      after: { conditions, actions },
    });
  } else {
    const created = await prisma.rule.create({
      data: {
        ...data,
        storeId,
        ruleSetId: ruleSet.id,
        key,
        source: "HUMAN",
        createdById: user.id,
      },
    });
    await logAudit({
      storeId,
      action: "RULE_CREATED",
      entityType: "Rule",
      entityId: created.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      after: { key, conditions, actions },
    });
  }

  revalidatePath("/admin/rules", "layout");
  redirect(`/admin/rules/${cat.toLowerCase()}?saved=1`);
}

// ---------------------------------------------------------------------------
// Operatii pe reguli
// ---------------------------------------------------------------------------

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireAdmin();
  const ruleId = formData.get("ruleId");
  if (typeof ruleId !== "string") return;

  const rule = await prisma.rule.findFirst({ where: { id: ruleId, storeId } });
  if (!rule) return;

  await prisma.rule.update({
    where: { id: rule.id },
    data: { enabled: !rule.enabled, status: "DRAFT" },
  });
  await logAudit({
    storeId,
    action: rule.enabled ? "RULE_DISABLED" : "RULE_ENABLED",
    entityType: "Rule",
    entityId: rule.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
  });
  revalidatePath("/admin/rules", "layout");
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireAdmin();
  const ruleId = formData.get("ruleId");
  if (typeof ruleId !== "string") return;

  const rule = await prisma.rule.findFirst({ where: { id: ruleId, storeId } });
  if (!rule) return;

  // Stergerea afecteaza doar draftul de lucru; versiunile publicate raman
  // neatinse pana la urmatorul publish.
  await prisma.rule.delete({ where: { id: rule.id } });
  await logAudit({
    storeId,
    action: "RULE_DELETED",
    entityType: "Rule",
    entityId: rule.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    before: { key: rule.key, name: rule.name },
  });
  revalidatePath("/admin/rules", "layout");
}

// ---------------------------------------------------------------------------
// Publicare / rollback / kill switch / strategie
// ---------------------------------------------------------------------------

export interface PublishState {
  ok: boolean;
  message?: string;
  issues?: string[];
}

export async function publishAction(
  category: string,
  // semnatura useActionState: (prevState, formData)
  ...[]: [PublishState | undefined, FormData]
): Promise<PublishState> {
  const { user, storeId } = await requireAdmin();
  const cat = parseCategory(category);

  const result = await publishVersion(storeId, cat, user);
  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      issues: result.issues?.map((i) => `${i.path}: ${i.message}`),
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: `Versiunea ${result.version} este acum activă.` };
}

export async function rollbackAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireAdmin();
  const versionId = formData.get("versionId");
  if (typeof versionId !== "string") return;

  const version = await prisma.ruleVersion.findFirst({
    where: { id: versionId, storeId },
    include: { ruleSet: { select: { category: true } } },
  });
  if (!version) return;

  const result = await rollbackToVersion(storeId, versionId, user);
  revalidatePath("/", "layout");
  if (result.ok) {
    // Dupa rollback, adminul vede imediat CE a activat: continutul versiunii.
    redirect(
      `/admin/rules/${version.ruleSet.category.toLowerCase()}/versions/${versionId}?activated=1`,
    );
  }
}

export async function killSwitchAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireAdmin();
  const cat = parseCategory(formData.get("category"));
  const on = formData.get("on") === "true";
  const reason = formData.get("reason");

  await setKillSwitch(
    storeId,
    cat,
    on,
    user,
    typeof reason === "string" && reason ? reason : undefined,
  );
  revalidatePath("/", "layout");
}

export async function setStrategyAction(formData: FormData): Promise<void> {
  const { user, storeId } = await requireAdmin();
  const cat = parseCategory(formData.get("category"));
  const strategy = String(formData.get("strategy") ?? "");
  if (!(CONFLICT_STRATEGIES as readonly string[]).includes(strategy)) return;

  const ruleSet = await getOrCreateRuleSet(storeId, cat);
  await prisma.ruleSet.update({
    where: { id: ruleSet.id },
    data: { conflictStrategy: strategy as (typeof CONFLICT_STRATEGIES)[number] },
  });
  await logAudit({
    storeId,
    action: "RULESET_UPDATED",
    entityType: "RuleSet",
    entityId: ruleSet.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    before: { conflictStrategy: ruleSet.conflictStrategy },
    after: { conflictStrategy: strategy },
  });
  revalidatePath("/admin/rules", "layout");
}
