import Image from "next/image";
import { FlaskConical, MoveRight, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { evaluateRuleSet, type RuleSetSnapshot } from "@/lib/engine";
import { buildCandidateSnapshot, getActiveRuleset } from "@/lib/rules/service";
import { applyPricingDecision } from "@/lib/shop/pricing-decision";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { ProductSearch } from "./product-search";
import type { Product } from "@prisma/client";

function evaluateForProduct(snapshot: RuleSetSnapshot, product: Product) {
  const result = evaluateRuleSet(snapshot, {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      brand: product.brand,
      basePriceCents: product.basePriceCents,
      stock: product.stock,
      tags: product.tags,
    },
    customer: { loyaltyTier: "STANDARD", completedOrders: 0 },
    session: { isGuest: true, isAuthenticated: false },
  });
  return {
    finalCents: applyPricingDecision(product.basePriceCents, result.decision),
    matchedRules: result.matchedRules,
    version: result.rulesetVersion,
  };
}

function ResultCard({
  tone,
  product,
  finalCents,
  matchedRules,
  ruleNames,
}: {
  tone: "live" | "draft";
  product: Product;
  finalCents: number;
  matchedRules: string[];
  ruleNames: Map<string, string>;
}) {
  const discounted = finalCents !== product.basePriceCents;
  return (
    <div className="flex-1 rounded-xl border border-line bg-surface p-4">
      {tone === "live" ? (
        <Badge tone="positive">acum în magazin</Badge>
      ) : (
        <Badge tone="caution">după publicare</Badge>
      )}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums">
          {formatMoney(finalCents, product.currency)}
        </span>
        {discounted && (
          <>
            <s className="text-sm tabular-nums text-ink-faint">
              {formatMoney(product.basePriceCents, product.currency)}
            </s>
            <Badge tone="critical">
              −{Math.round((1 - finalCents / product.basePriceCents) * 100)}%
            </Badge>
          </>
        )}
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        {matchedRules.length === 0
          ? "Nicio regulă nu se aplică."
          : matchedRules.map((key) => ruleNames.get(key) ?? key).join(", ")}
      </p>
    </div>
  );
}

/**
 * „Testează pe un produs": cautare cu autocomplete, apoi pretul calculat de
 * versiunea activa si — daca exista drafturi — cel de dupa publicare.
 */
export async function PriceTester({
  storeId,
  testedProductId,
  hasDraftChanges,
}: {
  storeId: string;
  testedProductId?: string;
  hasDraftChanges: boolean;
}) {
  const products = await prisma.product.findMany({
    where: { storeId, active: true },
    orderBy: { name: "asc" },
    take: 200,
  });

  const tested = testedProductId
    ? products.find((p) => p.id === testedProductId)
    : undefined;

  let live: ReturnType<typeof evaluateForProduct> | null = null;
  let candidate: ReturnType<typeof evaluateForProduct> | null = null;
  let ruleNames = new Map<string, string>();

  if (tested) {
    const [activeRuleset, candidateSnapshot, ruleRows] = await Promise.all([
      getActiveRuleset(storeId, "PRICING"),
      buildCandidateSnapshot(storeId, "PRICING"),
      prisma.rule.findMany({
        where: { storeId },
        select: { key: true, name: true },
      }),
    ]);
    ruleNames = new Map(ruleRows.map((r) => [r.key, r.name]));

    live =
      activeRuleset && !activeRuleset.killSwitch
        ? evaluateForProduct(activeRuleset.snapshot, tested)
        : { finalCents: tested.basePriceCents, matchedRules: [], version: 0 };
    candidate = evaluateForProduct(candidateSnapshot, tested);
  }

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <FlaskConical className="size-5 text-accent" strokeWidth={1.75} />
        Testează pe un produs
      </h2>

      <div className="mt-3 rounded-xl border border-line bg-surface-raised p-4">
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
        />

        {tested && live && candidate && (
          <div className="mt-4 flex flex-col gap-4 lg:flex-row">
            {/* Produsul testat, cu imagine */}
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
                  {tested.sku} · preț de bază{" "}
                  {formatMoney(tested.basePriceCents, tested.currency)}
                </p>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-stretch">
              <ResultCard
                tone="live"
                product={tested}
                finalCents={live.finalCents}
                matchedRules={live.matchedRules}
                ruleNames={ruleNames}
              />
              {hasDraftChanges && (
                <>
                  <div className="hidden items-center sm:flex">
                    <MoveRight className="size-5 text-ink-faint" />
                  </div>
                  <ResultCard
                    tone="draft"
                    product={tested}
                    finalCents={candidate.finalCents}
                    matchedRules={candidate.matchedRules}
                    ruleNames={ruleNames}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {tested && hasDraftChanges && live && candidate &&
          live.finalCents === candidate.finalCents && (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
              <TriangleAlert className="size-4 text-caution" strokeWidth={1.75} />
              Drafturile nepublicate nu schimbă prețul acestui produs.
            </p>
          )}
      </div>
    </div>
  );
}
