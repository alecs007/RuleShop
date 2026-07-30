import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { DECISION_CATEGORIES, type DecisionCategory } from "@/lib/engine";
import { CATEGORY_LABELS } from "@/lib/rules/defaults";
import {
  getActionOptions,
  getFactOptions,
  getOperatorOptions,
  ruleToFormInitial,
} from "@/lib/rules/form-mapping";
import { getDynamicParamOptions } from "@/lib/rules/store-options";
import { RuleForm } from "@/components/control-plane/rule-form";
import { saveRuleAction } from "../../actions";

export const metadata: Metadata = { title: "Editează regula" };

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ category: string; ruleId: string }>;
}) {
  const { category: raw, ruleId } = await params;
  const category = raw.toUpperCase() as DecisionCategory;
  if (!DECISION_CATEGORIES.includes(category)) notFound();

  const { storeId } = await requireAdmin();
  const rule = await prisma.rule.findFirst({ where: { id: ruleId, storeId } });
  if (!rule) notFound();

  const dynamic = await getDynamicParamOptions(storeId, category);
  const save = saveRuleAction.bind(null, category, rule.id);

  return (
    <div className="appear-content">
      <h1 className="text-2xl font-semibold tracking-tight">{rule.name}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {CATEGORY_LABELS[category]} · <span className="font-mono">{rule.key}</span>
      </p>
      <div className="mt-6">
        <RuleForm
          action={save}
          facts={getFactOptions(category)}
          operators={getOperatorOptions()}
          actionDefs={getActionOptions(category, dynamic)}
          initial={ruleToFormInitial(rule)}
        />
      </div>
    </div>
  );
}
