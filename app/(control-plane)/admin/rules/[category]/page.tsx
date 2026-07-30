import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  OctagonX,
  Pencil,
  Plus,
  Truck,
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
import { getOrCreateRuleSet } from "@/lib/rules/service";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { CategoryIcon } from "@/components/control-plane/category-icon";
import { PublishButton } from "@/components/control-plane/publish-button";
import { PriceTester } from "@/components/control-plane/price-tester";
import {
  parseSimulation,
  ShippingTester,
} from "@/components/control-plane/shipping-tester";
import {
  FraudTester,
  parseFraudSimulation,
} from "@/components/control-plane/fraud-tester";
import {
  deleteRuleAction,
  killSwitchAction,
  publishAction,
  rollbackAction,
  setStrategyAction,
  toggleRuleAction,
} from "../actions";

export const metadata: Metadata = { title: "Reguli" };

function parseCategory(raw: string): DecisionCategory | null {
  const value = raw.toUpperCase() as DecisionCategory;
  return DECISION_CATEGORIES.includes(value) ? value : null;
}

export default async function RuleSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{
    saved?: string;
    test?: string;
    subtotal?: string;
    items?: string;
    weight?: string;
    who?: string;
    total?: string;
    fitems?: string;
    fwho?: string;
    country?: string;
    velocity?: string;
    mismatch?: string;
  }>;
}) {
  const { category: rawCategory } = await params;
  const query = await searchParams;
  const { saved, test } = query;
  const category = parseCategory(rawCategory);
  if (!category) notFound();

  const { storeId } = await requireStaff();
  const ruleSet = await getOrCreateRuleSet(storeId, category);

  // Metodele si moneda magazinului — necesare testerelor de livrare si antifraudă.
  const store =
    category === "SHIPPING" || category === "FRAUD"
      ? await prisma.store.findUnique({ where: { id: storeId } })
      : null;

  const [rules, versions] = await Promise.all([
    prisma.rule.findMany({
      where: { ruleSetId: ruleSet.id },
      orderBy: { priority: "desc" },
    }),
    prisma.ruleVersion.findMany({
      where: { ruleSetId: ruleSet.id },
      orderBy: { version: "desc" },
      take: 10,
      include: { publishedBy: { select: { email: true } } },
    }),
  ]);

  const activeVersion = versions.find((v) => v.id === ruleSet.activeVersionId);
  const nextVersion = (versions[0]?.version ?? 0) + 1;
  const hasDraftChanges = rules.some((r) => r.status === "DRAFT");
  const publishWithCategory = publishAction.bind(null, category);
  const base = `/admin/rules/${category.toLowerCase()}`;

  return (
    <div className="appear-content">
      {/* Confirmare dupa salvarea unei reguli */}
      {saved && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2
            className="size-5 shrink-0 text-positive"
            strokeWidth={1.75}
          />
          <p className="text-sm">
            <span className="font-medium text-positive">
              Regula a fost salvată.
            </span>{" "}
            <span className="text-ink-muted">
              Intră în vigoare când apeși „Publică v{nextVersion}”.
            </span>
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted mb-2">
            <Link href="/admin/rules" className="hover:text-ink">
              Reguli
            </Link>{" "}
            /
          </p>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <CategoryIcon category={category} className="size-6 text-accent" />
            {CATEGORY_LABELS[category]}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {activeVersion ? (
              <Badge tone="positive">
                v{activeVersion.version} activă în magazin
              </Badge>
            ) : (
              <Badge>încă nepublicat</Badge>
            )}
            {hasDraftChanges && (
              <Badge tone="caution">modificări nepublicate</Badge>
            )}
            {ruleSet.killSwitch && (
              <Badge tone="critical">kill switch activ</Badge>
            )}
          </div>
        </div>
        <PublishButton action={publishWithCategory} nextVersion={nextVersion} />
      </div>

      {/* Fluxul, intr-o singura linie */}
      {/* <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <Pencil className="size-3.5" strokeWidth={1.75} /> Modifici reguli
        <span aria-hidden>→</span>
        <Rocket className="size-3.5" strokeWidth={1.75} /> Publici
        <span aria-hidden>→</span>
        <Undo2 className="size-3.5" strokeWidth={1.75} /> Rollback oricând
      </p> */}

      {/* Livrarea are si o parte de configurare, nu doar reguli */}
      {category === "SHIPPING" && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
          <Truck className="size-3.5" strokeWidth={1.75} />
          Regulile decid costul și disponibilitatea metodelor din{" "}
          <Link
            href="/admin/shipping"
            className="text-accent underline-offset-2 hover:underline"
          >
            lista de metode a magazinului
          </Link>
          .
        </p>
      )}

      {/* Ce ruleaza ACUM in magazin: regulile versiunii active */}
      {activeVersion && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50/60 p-4">
          <p className="text-sm font-semibold">
            În magazin acum · v{activeVersion.version}
          </p>
          <ul className="mt-2 space-y-1.5">
            {(activeVersion.snapshot as unknown as RuleSetSnapshot).rules
              .length === 0 ? (
              <li className="text-sm text-ink-muted">
                Nicio regulă — comportamentul implicit.
              </li>
            ) : (
              [...(activeVersion.snapshot as unknown as RuleSetSnapshot).rules]
                .sort((a, b) => b.priority - a.priority)
                .map((rule) => {
                  const text = tryHumanizeRule(rule.conditions, rule.actions);
                  return (
                    <li
                      key={rule.key}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Zap
                        className="mt-0.5 size-3.5 shrink-0 text-positive"
                        strokeWidth={1.75}
                      />
                      <span className="text-ink-muted">
                        <span className="font-medium text-ink">
                          {rule.name}:
                        </span>{" "}
                        {text ? (
                          <>
                            DACĂ {text.if} ATUNCI {text.then}
                          </>
                        ) : (
                          <span className="font-mono text-xs">{rule.key}</span>
                        )}
                      </span>
                    </li>
                  );
                })
            )}
          </ul>
        </div>
      )}

      {/* Setari ruleset */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-raised p-4">
        <ActionForm
          action={setStrategyAction}
          success="Strategia de conflict a fost salvată."
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="category" value={category} />
          <label htmlFor="strategy" className="text-sm text-ink-muted">
            Când se potrivesc mai multe reguli, câștigă:
          </label>
          <select
            id="strategy"
            name="strategy"
            defaultValue={ruleSet.conflictStrategy}
            className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-accent"
          >
            {Object.entries(STRATEGY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="h-9 cursor-pointer rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-ink-faint">
            Salvează
          </button>
        </ActionForm>

        <ActionForm
          action={killSwitchAction}
          success={
            ruleSet.killSwitch
              ? "Regulile au fost repornite."
              : "Kill switch activat — nicio regulă nu se mai aplică."
          }
          confirm={
            ruleSet.killSwitch
              ? undefined
              : "Oprești TOATE regulile din această categorie? Magazinul revine la comportamentul implicit."
          }
          className="ml-auto"
        >
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="on" value={String(!ruleSet.killSwitch)} />
          <button
            title={
              ruleSet.killSwitch
                ? "Regulile revin în funcțiune"
                : "Oprește TOATE regulile din această categorie; magazinul revine la comportamentul implicit"
            }
            className={
              ruleSet.killSwitch
                ? "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-ink px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
                : "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium text-critical transition-colors hover:bg-red-50"
            }
          >
            <OctagonX className="size-4" strokeWidth={1.75} />
            {ruleSet.killSwitch
              ? "Repornește regulile"
              : "Oprește tot (kill switch)"}
          </button>
        </ActionForm>
      </div>

      {ruleSet.killSwitch && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <OctagonX
            className="size-5 shrink-0 text-critical"
            strokeWidth={1.75}
          />
          <p className="text-ink-muted">
            <span className="font-medium text-critical">
              Kill switch activ:
            </span>{" "}
            nicio regulă nu se aplică — magazinul folosește comportamentul
            implicit.
          </p>
        </div>
      )}

      {/* Reguli */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Reguli ({rules.length})</h2>
        <Link
          href={`${base}/new`}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          <Plus className="size-4" /> Regulă nouă
        </Link>
      </div>

      {rules.length === 0 ? (
        <div className="mt-3 rounded-xl border border-line bg-surface-raised p-8 text-center">
          <Zap className="mx-auto size-8 text-ink-faint" strokeWidth={1.5} />
          <p className="mt-3 font-medium">Nicio regulă încă</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
            O regulă spune magazinului: „DACĂ se întâmplă ceva, ATUNCI fă ceva”.
            De exemplu: „DACĂ produsul e din categoria gaming, ATUNCI aplică 20%
            reducere”.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {rules.map((rule) => {
            const text = tryHumanizeRule(rule.conditions, rule.actions);
            return (
              <li
                key={rule.id}
                className="rounded-xl border border-line bg-surface-raised p-4 transition-colors hover:border-ink-faint"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{rule.name}</p>
                      {rule.status === "DRAFT" && (
                        <Badge tone="caution">draft</Badge>
                      )}
                      {rule.source === "AI_SUGGESTION" && (
                        <Badge tone="accent">IA</Badge>
                      )}
                      {!rule.enabled && <Badge>dezactivată</Badge>}
                    </div>
                    {text && (
                      <p className="mt-1.5 flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
                        <Zap
                          className="mt-0.5 size-4 shrink-0 text-accent"
                          strokeWidth={1.75}
                        />
                        <span>
                          <span className="font-medium text-ink">DACĂ</span>{" "}
                          {text.if}{" "}
                          <span className="font-medium text-ink">ATUNCI</span>{" "}
                          {text.then}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge>prioritate {priorityLabel(rule.priority)}</Badge>
                    <ActionForm
                      action={toggleRuleAction}
                      success={
                        rule.enabled
                          ? `Regula „${rule.name}" a fost oprită.`
                          : `Regula „${rule.name}" a fost pornită.`
                      }
                    >
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <button
                        className="cursor-pointer"
                        title={
                          rule.enabled
                            ? "Dezactivează (rămâne salvată, dar nu se mai aplică)"
                            : "Activează regula"
                        }
                      >
                        {rule.enabled ? (
                          <Badge tone="positive">pornită</Badge>
                        ) : (
                          <Badge>oprită</Badge>
                        )}
                      </button>
                    </ActionForm>
                    <Link
                      href={`${base}/${rule.id}`}
                      className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink"
                      aria-label={`Editează ${rule.name}`}
                    >
                      <Pencil className="size-4" strokeWidth={1.75} />
                    </Link>
                    <ActionForm
                      action={deleteRuleAction}
                      confirm={`Ștergi definitiv regula „${rule.name}"? Versiunile deja publicate rămân neatinse.`}
                      success={`Regula „${rule.name}" a fost ștearsă.`}
                    >
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <button
                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-red-50 hover:text-critical"
                        aria-label={`Șterge ${rule.name}`}
                        title="Șterge regula"
                      >
                        ✕
                      </button>
                    </ActionForm>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Tester de pret — doar pentru PRICING */}
      {category === "PRICING" && (
        <PriceTester
          storeId={storeId}
          testedProductId={test}
          hasDraftChanges={hasDraftChanges}
        />
      )}

      {/* Tester de livrare — doar pentru SHIPPING */}
      {category === "SHIPPING" && (
        <ShippingTester
          storeId={storeId}
          storeSettings={store?.settings}
          currency={store?.currency ?? "RON"}
          hasDraftChanges={hasDraftChanges}
          simulation={parseSimulation(query)}
        />
      )}

      {/* Tester antifraudă — doar pentru FRAUD */}
      {category === "FRAUD" && (
        <FraudTester
          storeId={storeId}
          currency={store?.currency ?? "RON"}
          hasDraftChanges={hasDraftChanges}
          simulation={parseFraudSimulation(query)}
        />
      )}

      {/* Versiuni */}
      <h2 className="mt-10 text-lg font-semibold">Istoric versiuni</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface-raised">
        {/* Pe telefon rămân versiunea si actiunile; data si diff-ul se mută sub versiune */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-medium">Versiune</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">
                Publicată
              </th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Modificări
              </th>
              <th className="px-4 py-3 font-medium text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {versions.map((version) => {
              const isActive = ruleSet.activeVersionId === version.id;
              const diff = (version.diff ?? {}) as Record<string, string[]>;
              const diffParts = [
                diff.added?.length ? `+${diff.added.length} noi` : null,
                diff.changed?.length
                  ? `~${diff.changed.length} modificate`
                  : null,
                diff.removed?.length
                  ? `−${diff.removed.length} eliminate`
                  : null,
              ].filter(Boolean);
              const publishedLabel = version.publishedAt
                ? new Intl.DateTimeFormat("ro-RO", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(version.publishedAt)
                : "—";
              return (
                <tr
                  key={version.id}
                  className="transition-colors hover:bg-zinc-50"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`${base}/versions/${version.id}`}
                        className="font-medium tabular-nums hover:underline"
                      >
                        v{version.version}
                      </Link>
                      {isActive && <Badge tone="positive">activă</Badge>}
                    </div>
                    {/* Detaliile din coloanele ascunse, recuperate pe ecrane mici */}
                    <p className="mt-1 text-xs text-ink-faint sm:hidden">
                      {publishedLabel}
                      {diffParts.length > 0 && ` · ${diffParts.join(", ")}`}
                    </p>
                    {diffParts.length > 0 && (
                      <p className="mt-1 hidden text-xs text-ink-faint sm:block md:hidden">
                        {diffParts.join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">
                    {publishedLabel}
                    {version.publishedBy?.email && (
                      <span className="text-ink-faint">
                        {" "}
                        · {version.publishedBy.email}
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-muted md:table-cell">
                    {diffParts.length > 0 ? diffParts.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`${base}/versions/${version.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink"
                        title="Vezi regulile din această versiune"
                      >
                        <Eye className="size-3.5" strokeWidth={1.75} /> Conținut
                      </Link>
                      {!isActive && (
                        <form action={rollbackAction} className="inline">
                          <input
                            type="hidden"
                            name="versionId"
                            value={version.id}
                          />
                          <button
                            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink"
                            title="Reactivează această versiune în magazin"
                          >
                            <Undo2 className="size-3.5" /> Rollback
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {versions.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-ink-muted"
                >
                  Nicio versiune publicată încă — publică prima versiune ca
                  regulile să ajungă în magazin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
