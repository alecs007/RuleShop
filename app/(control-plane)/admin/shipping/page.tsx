import type { Metadata } from "next";
import Link from "next/link";
import { Info, Scale, Truck } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import type { RuleAction, RuleSetSnapshot } from "@/lib/engine";
import { tryHumanizeRule } from "@/lib/rules/humanize";
import { getActiveRuleset } from "@/lib/rules/service";
import {
  readShippingMethods,
  usesDefaultShippingMethods,
} from "@/lib/shop/shipping-methods";
import { Badge } from "@/components/ui/badge";
import {
  ShippingMethodsForm,
  type MethodRow,
} from "@/components/control-plane/shipping-methods-form";
import { saveShippingMethodsAction } from "./actions";

export const metadata: Metadata = { title: "Livrare" };

/** Regulile publicate, in limbaj natural — ce fac ele efectiv cu metodele. */
function activeRuleLines(snapshot: RuleSetSnapshot | null): string[] {
  if (!snapshot) return [];
  return snapshot.rules.flatMap((rule) => {
    const text = tryHumanizeRule(rule.conditions, rule.actions);
    return text ? [`${rule.name}: DACĂ ${text.if} ATUNCI ${text.then}`] : [];
  });
}

/** ID-urile de metode numite explicit de regulile publicate. */
function referencedIds(snapshot: RuleSetSnapshot | null): Set<string> {
  const ids = new Set<string>();
  for (const rule of snapshot?.rules ?? []) {
    for (const action of (rule.actions ?? []) as RuleAction[]) {
      const method = action.params?.method;
      if (typeof method === "string") ids.add(method);
    }
  }
  return ids;
}

export default async function AdminShippingPage() {
  const { storeId } = await requireAdmin();

  const [store, ruleset] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    getActiveRuleset(storeId, "SHIPPING"),
  ]);

  const methods = readShippingMethods(store?.settings);
  const usesDefaults = usesDefaultShippingMethods(store?.settings);
  const referenced = referencedIds(ruleset?.snapshot ?? null);
  const ruleLines = activeRuleLines(ruleset?.snapshot ?? null);

  const initial: MethodRow[] = methods.map((m) => ({
    id: m.id,
    label: m.label,
    costLei: (m.costCents / 100).toFixed(2),
    etaDaysMin: String(m.etaDaysMin),
    etaDaysMax: String(m.etaDaysMax),
  }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <Truck className="size-6 text-accent" strokeWidth={1.75} />
            Livrare
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Metodele pe care le vede clientul, cu costul de listă. Cât plătește
            de fapt, ce metode îi apar și în câte zile primește comanda decide
            rulesetul de livrare.
          </p>
        </div>
        <Link
          href="/admin/rules/shipping"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3.5 text-sm font-medium transition-colors hover:border-ink-faint"
        >
          <Scale className="size-4" strokeWidth={1.75} />
          Reguli de livrare
        </Link>
      </div>

      {usesDefaults && (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
          <p className="text-ink-muted">
            <span className="font-medium text-accent-ink">
              Magazinul folosește lista implicită.
            </span>{" "}
            Salvează metodele o dată ca să devină ale magazinului tău.
          </p>
        </div>
      )}

      <div className="mt-6">
        <ShippingMethodsForm action={saveShippingMethodsAction} initial={initial} />
      </div>

      {/* Ce fac regulile publicate cu aceste metode */}
      <h2 className="mt-10 text-lg font-semibold">Ce spun regulile acum</h2>
      {ruleLines.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          Nicio regulă de livrare publicată — clientul plătește exact costurile de
          listă din tabel.{" "}
          <Link href="/admin/rules/shipping" className="text-accent hover:underline">
            Adaugă prima regulă
          </Link>
          .
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-1.5">
            {ruleLines.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-ink-muted">
                <Scale className="mt-0.5 size-3.5 shrink-0 text-positive" strokeWidth={1.75} />
                {line}
              </li>
            ))}
          </ul>
          {referenced.size > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
              Metode numite explicit în reguli:
              {[...referenced].map((id) => (
                <Badge
                  key={id}
                  tone={methods.some((m) => m.id === id) ? "neutral" : "critical"}
                  className="font-mono"
                >
                  {id}
                </Badge>
              ))}
            </p>
          )}
        </>
      )}
    </div>
  );
}
