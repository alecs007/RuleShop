import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Undo2,
  Zap,
} from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import {
  DECISION_CATEGORIES,
  type DecisionCategory,
  type RuleSetSnapshot,
} from "@/lib/engine";
import { CATEGORY_LABELS, STRATEGY_LABELS } from "@/lib/rules/defaults";
import { tryHumanizeRule } from "@/lib/rules/humanize";
import { priorityLabel } from "@/lib/rules/priority";
import { Badge } from "@/components/ui/badge";
import { rollbackAction } from "../../../actions";

export const metadata: Metadata = { title: "Conținut versiune" };

export default async function VersionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; versionId: string }>;
  searchParams: Promise<{ activated?: string }>;
}) {
  const { category: raw, versionId } = await params;
  const { activated } = await searchParams;
  const category = raw.toUpperCase() as DecisionCategory;
  if (!DECISION_CATEGORIES.includes(category)) notFound();

  const { storeId } = await requireStaff();
  const version = await prisma.ruleVersion.findFirst({
    where: { id: versionId, storeId },
    include: {
      ruleSet: { select: { activeVersionId: true, category: true } },
      publishedBy: { select: { email: true, name: true } },
    },
  });
  if (!version || version.ruleSet.category !== category) notFound();

  const snapshot = version.snapshot as unknown as RuleSetSnapshot;
  const isActive = version.ruleSet.activeVersionId === version.id;
  const diff = (version.diff ?? {}) as Record<string, string[]>;
  const base = `/admin/rules/${category.toLowerCase()}`;

  return (
    <div>
      {activated && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" strokeWidth={1.75} />
          <div>
            <p className="font-medium text-positive">
              Rollback efectuat — versiunea {version.version} este acum activă.
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">
              Mai jos vezi exact regulile care rulează acum în magazin.
            </p>
          </div>
        </div>
      )}

      <Link
        href={base}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> {CATEGORY_LABELS[category]}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <GitBranch className="size-6 text-ink-faint" strokeWidth={1.75} />
            Versiunea {version.version}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            {isActive ? (
              <Badge tone="positive">activă în magazin</Badge>
            ) : (
              <Badge>istorică</Badge>
            )}
            {version.publishedAt && (
              <span>
                publicată{" "}
                {new Intl.DateTimeFormat("ro-RO", {
                  dateStyle: "long",
                  timeStyle: "short",
                }).format(version.publishedAt)}
              </span>
            )}
            {version.publishedBy && (
              <span>de {version.publishedBy.name ?? version.publishedBy.email}</span>
            )}
          </div>
        </div>

        {!isActive && (
          <form action={rollbackAction}>
            <input type="hidden" name="versionId" value={version.id} />
            <button className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700">
              <Undo2 className="size-4" strokeWidth={1.75} />
              Activează această versiune
            </button>
          </form>
        )}
      </div>

      {/* Ce s-a schimbat fata de versiunea anterioara */}
      {(diff.added?.length || diff.changed?.length || diff.removed?.length) ? (
        <div className="mt-6 rounded-xl border border-line bg-surface-raised p-4 text-sm">
          <p className="font-medium">Față de versiunea anterioară:</p>
          <ul className="mt-2 space-y-1 text-ink-muted">
            {diff.added?.map((key) => (
              <li key={`a-${key}`}>
                <span className="font-medium text-positive">+ adăugată</span>{" "}
                <span className="font-mono text-xs">{key}</span>
              </li>
            ))}
            {diff.changed?.map((key) => (
              <li key={`c-${key}`}>
                <span className="font-medium text-caution">~ modificată</span>{" "}
                <span className="font-mono text-xs">{key}</span>
              </li>
            ))}
            {diff.removed?.map((key) => (
              <li key={`r-${key}`}>
                <span className="font-medium text-critical">− eliminată</span>{" "}
                <span className="font-mono text-xs">{key}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Setari */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-wide text-ink-faint">
            Strategie de conflict
          </p>
          <p className="mt-1 text-sm font-medium">
            {STRATEGY_LABELS[snapshot.conflictStrategy] ?? snapshot.conflictStrategy}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-wide text-ink-faint">
            Reguli în versiune
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums">
            {snapshot.rules.length}
          </p>
        </div>
      </div>

      {/* Continutul: regulile, in limbaj natural */}
      <h2 className="mt-8 text-lg font-semibold">Regulile din această versiune</h2>
      {snapshot.rules.length === 0 ? (
        <p className="mt-3 rounded-xl border border-line bg-surface-raised p-6 text-sm text-ink-muted">
          Versiunea nu conține nicio regulă — magazinul folosește comportamentul
          implicit (fără reduceri, fără excepții).
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {[...snapshot.rules]
            .sort((a, b) => b.priority - a.priority)
            .map((rule) => {
              const text = tryHumanizeRule(rule.conditions, rule.actions);
              return (
                <li
                  key={rule.key}
                  className="rounded-xl border border-line bg-surface-raised p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{rule.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge>prioritate {priorityLabel(rule.priority)}</Badge>
                      <span className="font-mono text-xs text-ink-faint">{rule.key}</span>
                    </div>
                  </div>
                  {text && (
                    <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
                      <Zap className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
                      <span>
                        <span className="font-medium text-ink">DACĂ</span> {text.if}{" "}
                        <span className="font-medium text-ink">ATUNCI</span> {text.then}
                      </span>
                    </p>
                  )}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
