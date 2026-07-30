import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getRuleNames } from "@/lib/rules/service";
import { DECISION_LABELS, RISK_LEVEL_LABELS } from "@/lib/shop/fraud-risk";
import type { FraudDecisionValue, RiskLevelValue } from "@/lib/shop/fraud-risk";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "@/lib/shop/order-status";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { IncidentReview } from "@/components/control-plane/incident-review";
import { AiIncidentOpinion } from "@/components/control-plane/ai-incident-opinion";
import { isAiConfigured } from "@/lib/ai/gemini";

export const metadata: Metadata = { title: "Antifraudă" };

const REVIEW_LABELS: Record<string, string> = {
  OPEN: "În aşteptare",
  CONFIRMED_FRAUD: "Fraudă confirmată",
  FALSE_POSITIVE: "Alarmă falsă",
  DISMISSED: "Fără acțiune",
};

const DECISION_TONES: Record<
  FraudDecisionValue,
  "neutral" | "positive" | "caution" | "critical"
> = {
  ALLOW: "positive",
  CHALLENGE: "caution",
  REVIEW: "caution",
  BLOCK: "critical",
};

const FILTERS = [
  { value: "open", label: "În aşteptare" },
  { value: "all", label: "Toate" },
] as const;

interface IncidentSignals {
  flagged?: string[];
  facts?: {
    session?: Record<string, unknown>;
    order?: Record<string, unknown>;
  };
}

export default async function FraudPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { storeId } = await requireStaff();
  const { filter } = await searchParams;
  const showAll = filter === "all";

  const where: Prisma.FraudIncidentWhereInput = {
    storeId,
    ...(showAll ? {} : { reviewStatus: "OPEN" }),
  };

  const [incidents, openCount, blockedCount, ruleNames] = await Promise.all([
    prisma.fraudIncident.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            totalCents: true,
            currency: true,
          },
        },
        reviewedBy: { select: { email: true, name: true } },
      },
    }),
    prisma.fraudIncident.count({ where: { storeId, reviewStatus: "OPEN" } }),
    prisma.fraudIncident.count({ where: { storeId, decision: "BLOCK" } }),
    getRuleNames(storeId),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Antifraudă</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Incidentele produse de regulile de la checkout.
          </p>
        </div>
        <Link
          href="/admin/rules/fraud"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-ink-faint"
        >
          <ShieldCheck className="size-4" strokeWidth={1.75} />
          Regulile antifraudă
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface-raised p-4">
          <p className="text-sm text-ink-muted">În aşteptare</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{openCount}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-raised p-4">
          <p className="text-sm text-ink-muted">Comenzi blocate</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{blockedCount}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-raised p-4">
          <p className="text-sm text-ink-muted">Incidente afișate</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {incidents.length}
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        {FILTERS.map((option) => {
          const active = showAll === (option.value === "all");
          return (
            <Link
              key={option.value}
              href={`/admin/fraud?filter=${option.value}`}
              className={
                active
                  ? "rounded-full border border-ink bg-ink px-3.5 py-1.5 text-sm text-white"
                  : "rounded-full border border-line bg-surface-raised px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink-faint"
              }
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      {incidents.length === 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-surface-raised p-8 text-center">
          <ShieldCheck className="mx-auto size-8 text-ink-faint" strokeWidth={1.5} />
          <p className="mt-3 font-medium">
            {showAll ? "Niciun incident înregistrat" : "Nimic de verificat"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
            Incidentele apar aici când o regulă antifraudă acordă scor de risc
            unei comenzi la checkout.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {incidents.map((incident) => {
            const signals = (incident.signals ?? {}) as IncidentSignals;
            const explanation = (incident.explanation ?? {}) as {
              summary?: string;
            };
            const rules = incident.matchedRuleKeys.map(
              (key) => ruleNames.get(key) ?? key,
            );
            const pendingOrder = incident.order?.status === "AWAITING_REVIEW";

            return (
              <li
                key={incident.id}
                className="rounded-xl border border-line bg-surface-raised p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={DECISION_TONES[incident.decision as FraudDecisionValue]}>
                        {DECISION_LABELS[incident.decision as FraudDecisionValue]}
                      </Badge>
                      <Badge>
                        {RISK_LEVEL_LABELS[incident.riskLevel as RiskLevelValue]} ·
                        scor {incident.riskScore}
                      </Badge>
                      {incident.reviewStatus !== "OPEN" && (
                        <Badge
                          tone={
                            incident.reviewStatus === "CONFIRMED_FRAUD"
                              ? "critical"
                              : incident.reviewStatus === "FALSE_POSITIVE"
                                ? "positive"
                                : "neutral"
                          }
                        >
                          {REVIEW_LABELS[incident.reviewStatus]}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-2 text-sm text-ink-muted">
                      {explanation.summary ?? "—"}
                    </p>

                    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
                      <div>
                        <dt className="inline">Când: </dt>
                        <dd className="inline">
                          {new Intl.DateTimeFormat("ro-RO", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(incident.createdAt)}
                        </dd>
                      </div>
                      {incident.email && (
                        <div>
                          <dt className="inline">Email: </dt>
                          <dd className="inline">{incident.email}</dd>
                        </div>
                      )}
                      {incident.ipAddress && (
                        <div>
                          <dt className="inline">IP: </dt>
                          <dd className="inline font-mono">{incident.ipAddress}</dd>
                        </div>
                      )}
                      {incident.rulesetVersion !== null && (
                        <div>
                          <dt className="inline">Versiune reguli: </dt>
                          <dd className="inline">v{incident.rulesetVersion}</dd>
                        </div>
                      )}
                      {incident.traceId && (
                        <div>
                          <dt className="inline">Trace: </dt>
                          <dd className="inline font-mono">{incident.traceId}</dd>
                        </div>
                      )}
                    </dl>

                    {(signals.flagged?.length ?? 0) > 0 && (
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <ShieldAlert className="size-3.5 text-caution" strokeWidth={1.75} />
                        {signals.flagged!.map((signal) => (
                          <Badge key={signal} tone="caution">
                            {signal}
                          </Badge>
                        ))}
                      </p>
                    )}

                    {rules.length > 0 && (
                      <p className="mt-1.5 text-xs text-ink-muted">
                        Reguli: {rules.join(", ")}
                      </p>
                    )}

                    {incident.reviewedBy && incident.reviewedAt && (
                      <p className="mt-1.5 text-xs text-ink-faint">
                        Verificat de{" "}
                        {incident.reviewedBy.name ?? incident.reviewedBy.email} ·{" "}
                        {new Intl.DateTimeFormat("ro-RO", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(incident.reviewedAt)}
                        {incident.reviewNotes && ` · „${incident.reviewNotes}"`}
                      </p>
                    )}
                  </div>

                  {incident.order && (
                    <div className="shrink-0 text-right">
                      <p className="font-medium">#{incident.order.orderNumber}</p>
                      <p className="mt-0.5 text-sm tabular-nums text-ink-muted">
                        {formatMoney(
                          incident.order.totalCents,
                          incident.order.currency,
                        )}
                      </p>
                      <Badge
                        tone={ORDER_STATUS_TONES[incident.order.status]}
                        className="mt-1"
                      >
                        {ORDER_STATUS_LABELS[incident.order.status]}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Opinia IA — vizibila si dupa review, ca istoric */}
                {(incident.reviewStatus === "OPEN" || incident.aiClassification) && (
                  <div className="mt-3 border-t border-line pt-3">
                    <AiIncidentOpinion
                      incidentId={incident.id}
                      classification={incident.aiClassification}
                      confidence={incident.aiConfidence}
                      rationale={incident.aiRationale}
                      aiConfigured={isAiConfigured()}
                    />
                  </div>
                )}

                {incident.reviewStatus === "OPEN" && (
                  <div className="mt-3 border-t border-line pt-3">
                    <IncidentReview
                      incidentId={incident.id}
                      hasPendingOrder={pendingOrder}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
