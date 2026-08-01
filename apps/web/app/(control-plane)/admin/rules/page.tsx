import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, OctagonX } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { DECISION_CATEGORIES } from "@ruleshop/rule-engine";
import { CATEGORY_LABELS } from "@/lib/rules/defaults";
import { Badge } from "@/components/ui/badge";
import { CategoryIconBadge } from "@/components/control-plane/category-icon";

export const metadata: Metadata = { title: "Reguli" };

export default async function RulesOverviewPage() {
  const { storeId } = await requireStaff();

  const ruleSets = await prisma.ruleSet.findMany({
    where: { storeId },
    include: {
      activeVersion: { select: { version: true, publishedAt: true } },
      _count: { select: { rules: true } },
    },
  });
  const byCategory = new Map(ruleSets.map((rs) => [rs.category, rs]));

  return (
    <div className="appear-content">
      <h1 className="text-2xl font-semibold tracking-tight">Reguli</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Punctele de decizie ale magazinului.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {DECISION_CATEGORIES.map((category) => {
          const rs = byCategory.get(category);
          return (
            <Link
              key={category}
              href={`/admin/rules/${category.toLowerCase()}`}
              className="group rounded-xl border border-line bg-surface-raised p-5 transition-all hover:border-ink-faint hover:shadow-subtle"
            >
              <div className="flex items-center gap-3">
                <CategoryIconBadge category={category} />
                <p className="min-w-0 flex-1 font-medium">
                  {CATEGORY_LABELS[category]}
                </p>
                <ChevronRight className="size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <span>{rs?._count.rules ?? 0} reguli</span>
                <span aria-hidden>·</span>
                {rs?.activeVersion ? (
                  <Badge tone="positive">v{rs.activeVersion.version} activă</Badge>
                ) : (
                  <Badge>nepublicat</Badge>
                )}
                {rs?.killSwitch && (
                  <Badge tone="critical">
                    <OctagonX className="mr-1 size-3" /> kill switch
                  </Badge>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
