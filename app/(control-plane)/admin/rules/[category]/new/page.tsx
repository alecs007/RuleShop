import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { DECISION_CATEGORIES, type DecisionCategory } from "@/lib/engine";
import { CATEGORY_LABELS } from "@/lib/rules/defaults";
import {
  getActionOptions,
  getFactOptions,
  getOperatorOptions,
} from "@/lib/rules/form-mapping";
import { getDynamicParamOptions } from "@/lib/rules/store-options";
import { RuleForm } from "@/components/control-plane/rule-form";
import { saveRuleAction } from "../../actions";

export const metadata: Metadata = { title: "Regulă nouă" };

export default async function NewRulePage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: raw } = await params;
  const category = raw.toUpperCase() as DecisionCategory;
  if (!DECISION_CATEGORIES.includes(category)) notFound();

  const { storeId } = await requireAdmin();
  const dynamic = await getDynamicParamOptions(storeId, category);
  const save = saveRuleAction.bind(null, category, null);

  return (
    <div className="appear-content">
      <h1 className="text-2xl font-semibold tracking-tight">Regulă nouă</h1>
      <p className="mt-1 text-sm text-ink-muted">{CATEGORY_LABELS[category]}</p>
      <div className="mt-6">
        <RuleForm
          action={save}
          facts={getFactOptions(category)}
          operators={getOperatorOptions()}
          actionDefs={getActionOptions(category, dynamic)}
        />
      </div>
    </div>
  );
}
