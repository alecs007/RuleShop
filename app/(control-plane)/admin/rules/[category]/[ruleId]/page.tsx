import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
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

      {/* Regulile venite de la IA se verifica inainte de publicare */}
      {rule.source === "AI_SUGGESTION" && rule.aiRationale && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.75} />
          <div className="text-sm">
            <p className="font-medium">
              Regulă generată de AI
              {typeof rule.aiConfidence === "number" &&
                ` · încredere ${Math.round(rule.aiConfidence * 100)}%`}
            </p>
            <p className="mt-0.5 text-ink-muted">{rule.aiRationale}</p>
            <p className="mt-1 text-xs text-ink-faint">
              Este doar un draft: verifică-l aici și intră în vigoare abia când
              publici versiunea.
            </p>
          </div>
        </div>
      )}

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
