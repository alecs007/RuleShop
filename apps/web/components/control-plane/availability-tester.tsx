import Image from "next/image";
import { FlaskConical, MoveRight, TriangleAlert } from "lucide-react";
import type { Product } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildCandidateSnapshot, getActiveRuleset } from "@/lib/rules/service";
import { availabilityFacts } from "@/lib/shop/availability";
import {
  availabilityLabel,
  availabilityTone,
  computeAvailability,
  type ActorFacts,
  type AvailabilityView,
} from "@/lib/shop/availability-view";
import { Badge } from "@/components/ui/badge";
import { ProductSearch } from "./product-search";

/** Cine se uita la produs — regulile pot depinde de client sau sesiune. */
export type TesterWho = "guest" | "client" | "vip";

const WHO_LABELS: Record<TesterWho, string> = {
  guest: "Vizitator (fără cont)",
  client: "Client autentificat",
  vip: "Client VIP",
};

export function parseWho(raw: string | undefined): TesterWho {
  return raw === "client" || raw === "vip" ? raw : "guest";
}

function actorFor(who: TesterWho): ActorFacts {
  if (who === "guest") {
    return {
      customer: { loyaltyTier: "STANDARD", loyaltyPoints: 0, completedOrders: 0 },
      session: { isGuest: true, isAuthenticated: false },
    };
  }
  return {
    customer: {
      loyaltyTier: who === "vip" ? "VIP" : "STANDARD",
      loyaltyPoints: who === "vip" ? 5000 : 100,
      completedOrders: who === "vip" ? 20 : 2,
    },
    session: { isGuest: false, isAuthenticated: true },
  };
}

function ResultCard({
  tone,
  view,
  ruleNames,
}: {
  tone: "live" | "draft";
  view: AvailabilityView;
  ruleNames: Map<string, string>;
}) {
  return (
    <div className="flex-1 rounded-xl border border-line bg-surface p-4">
      {tone === "live" ? (
        <Badge tone="positive">acum în magazin</Badge>
      ) : (
        <Badge tone="caution">după publicare</Badge>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={availabilityTone(view)}>{availabilityLabel(view)}</Badge>
        {view.hidden && <Badge tone="critical">nu apare în catalog</Badge>}
        {view.badges.map((badge) => (
          <Badge key={badge} tone="accent" className="uppercase">
            {badge}
          </Badge>
        ))}
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        {view.available ? (
          <>
            Un client poate cumpăra{" "}
            <span className="font-medium text-ink tabular-nums">
              {view.maxPerOrder}
            </span>{" "}
            {view.maxPerOrder === 1 ? "bucată" : "bucăți"} per comandă
            {view.ruleLimit !== null ? " (plafon impus de reguli)" : " (limita stocului)"}
            .
          </>
        ) : (
          "Produsul nu poate fi adăugat în coș."
        )}
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        {view.usedDefaults
          ? "Nicio regulă activă — decide doar stocul."
          : view.matchedRules.length === 0
            ? "Nicio regulă nu se aplică."
            : view.matchedRules.map((key) => ruleNames.get(key) ?? key).join(", ")}
      </p>
    </div>
  );
}

const inputCls =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors focus:border-accent";

/**
 * „Testează pe un produs": disponibilitatea decisa de versiunea activa si —
 * daca exista drafturi — de snapshotul care ar rezulta din publicare. Foloseste
 * exact aceeasi functie ca magazinul (`computeAvailability`), deci ce se vede
 * aici este ce vede clientul.
 */
export async function AvailabilityTester({
  storeId,
  testedProductId,
  who,
  hasDraftChanges,
}: {
  storeId: string;
  testedProductId?: string;
  who: TesterWho;
  hasDraftChanges: boolean;
}) {
  const products = await prisma.product.findMany({
    where: { storeId, active: true },
    orderBy: { name: "asc" },
    take: 200,
  });

  const tested: Product | undefined = testedProductId
    ? products.find((p) => p.id === testedProductId)
    : undefined;

  let live: AvailabilityView | null = null;
  let candidate: AvailabilityView | null = null;
  let ruleNames = new Map<string, string>();

  if (tested) {
    const [activeRuleset, candidateSnapshot, ruleRows] = await Promise.all([
      getActiveRuleset(storeId, "AVAILABILITY"),
      buildCandidateSnapshot(storeId, "AVAILABILITY"),
      prisma.rule.findMany({
        where: { storeId },
        select: { key: true, name: true },
      }),
    ]);
    ruleNames = new Map(ruleRows.map((r) => [r.key, r.name]));

    const product = availabilityFacts(tested);
    const actor = actorFor(who);
    live = computeAvailability({
      product,
      snapshot: activeRuleset?.snapshot ?? null,
      killSwitch: activeRuleset?.killSwitch,
      actor,
    });
    candidate = computeAvailability({
      product,
      snapshot: candidateSnapshot,
      actor,
    });
  }

  const sameOutcome =
    live &&
    candidate &&
    JSON.stringify([
      live.available,
      live.hidden,
      live.maxPerOrder,
      live.badges,
      live.message,
      live.lowStock,
    ]) ===
      JSON.stringify([
        candidate.available,
        candidate.hidden,
        candidate.maxPerOrder,
        candidate.badges,
        candidate.message,
        candidate.lowStock,
      ]);

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <FlaskConical className="size-5 text-accent" strokeWidth={1.75} />
        Testează pe un produs
      </h2>

      <div className="mt-3 rounded-xl border border-line bg-surface-raised p-4">
        <div className="flex flex-wrap items-end gap-3">
          <ProductSearch
            products={products.map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              priceCents: p.basePriceCents,
              currency: p.currency,
              imageUrl: p.imageUrls[0] ?? null,
            }))}
            selectedId={testedProductId}
            extraParams={who === "guest" ? undefined : { who }}
          />

          {/* Navigare GET: testul se poate trimite prin link */}
          <form className="flex items-end gap-2">
            {testedProductId && (
              <input type="hidden" name="test" value={testedProductId} />
            )}
            <label className="text-sm">
              <span className="text-ink-muted">Cumpărător</span>
              <select
                name="who"
                defaultValue={who}
                className={`${inputCls} mt-1 block cursor-pointer`}
              >
                {Object.entries(WHO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm font-medium transition-colors hover:border-ink-faint">
              Recalculează
            </button>
          </form>
        </div>

        {tested && live && candidate && (
          <div className="mt-4 flex flex-col gap-4 lg:flex-row">
            {/* Produsul testat, cu imagine si stocul real */}
            <div className="flex w-full items-center gap-3 lg:w-56 lg:flex-col lg:items-start">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100 lg:size-32 lg:w-full">
                {tested.imageUrls[0] && (
                  <Image
                    src={tested.imageUrls[0]}
                    alt={tested.name}
                    fill
                    sizes="(max-width: 1024px) 80px, 224px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{tested.name}</p>
                <p className="text-xs text-ink-faint">
                  {tested.sku} · stoc real: {tested.stock}{" "}
                  {tested.stock === 1 ? "bucată" : "bucăți"}
                </p>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-stretch">
              <ResultCard tone="live" view={live} ruleNames={ruleNames} />
              {hasDraftChanges && (
                <>
                  <div className="hidden items-center sm:flex">
                    <MoveRight className="size-5 text-ink-faint" />
                  </div>
                  <ResultCard
                    tone="draft"
                    view={candidate}
                    ruleNames={ruleNames}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {tested && hasDraftChanges && sameOutcome && (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
            <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
            Drafturile nepublicate nu schimbă disponibilitatea acestui produs.
          </p>
        )}
      </div>
    </div>
  );
}
