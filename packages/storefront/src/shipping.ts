/**
 * The SHIPPING ruleset is evaluated once per method, with `shipping.methodId`
 * in context, so a rule can target one method rather than shipping as a whole.
 * Decisions that are not about cost (disabled methods, a forced method) are
 * collected globally across those evaluations.
 */
import { evaluateRuleSet, type RuleSetSnapshot } from "@ruleshop/rule-engine";
import type { ShippingMethod } from "./shipping-methods";
import type { ActorFacts } from "./types";

export interface ShippingOption {
  id: string;
  label: string;
  /** List price, before rules. */
  baseCostCents: number;
  costCents: number;
  free: boolean;
  etaDaysMin: number;
  etaDaysMax: number;
  disabled: boolean;
  matchedRules: string[];
}

export interface ShippingQuote {
  /** Available methods, in the order the store configured. */
  options: ShippingOption[];
  disabledOptions: ShippingOption[];
  forcedMethodId: string | null;
  /** The method the total is computed on: the customer's choice or a default. */
  selected: ShippingOption | null;
  /** true when the customer's choice was dropped and replaced. */
  selectionChanged: boolean;
  cheapest: ShippingOption | null;
  currency: string;
  rulesetVersion: number | null;
  traceId: string | null;
  /** true when no ruleset is published or the kill switch is on. */
  usedDefaults: boolean;
}

export interface CartShippingFacts {
  subtotalCents: number;
  itemCount: number;
  weightGrams: number;
  categories: string[];
}


const GUEST_ACTOR: ActorFacts = {
  customer: { loyaltyTier: "STANDARD", completedOrders: 0 },
  session: { isGuest: true, isAuthenticated: false },
};

export interface QuoteComputation {
  methods: ShippingMethod[];
  /** The published snapshot; null means nothing has been published. */
  snapshot: RuleSetSnapshot | null;
  killSwitch?: boolean;
  cart: CartShippingFacts;
  currency: string;
  actor?: ActorFacts;
  selectedMethodId?: string | null;
}

/** The method as configured, before rules. */
function baseOption(method: ShippingMethod): ShippingOption {
  return {
    id: method.id,
    label: method.label,
    baseCostCents: method.costCents,
    costCents: method.costCents,
    free: method.costCents === 0,
    etaDaysMin: method.etaDaysMin,
    etaDaysMax: method.etaDaysMax,
    disabled: false,
    matchedRules: [],
  };
}

function applyDecision(
  method: ShippingMethod,
  decision: Record<string, unknown>,
): Pick<ShippingOption, "costCents" | "free" | "etaDaysMin" | "etaDaysMax"> {
  const override = decision.costCents;
  const costCents =
    decision.freeShipping === true
      ? 0
      : typeof override === "number" && override >= 0
        ? Math.round(override)
        : method.costCents;

  const eta = (key: "etaDaysMin" | "etaDaysMax") => {
    const value = decision[key];
    return typeof value === "number" && value >= 0 ? Math.round(value) : method[key];
  };

  return {
    costCents,
    free: costCents === 0,
    etaDaysMin: eta("etaDaysMin"),
    etaDaysMax: eta("etaDaysMax"),
  };
}

/** On equal cost the first in the store's display order wins. */
function cheapestOf(options: ShippingOption[]): ShippingOption | null {
  return options.reduce<ShippingOption | null>(
    (best, option) => (best === null || option.costCents < best.costCents ? option : best),
    null,
  );
}

/**
 * The customer's choice if it is still available, otherwise the cheapest.
 * `selectionChanged` flags the case where a rule removed their choice.
 */
function resolveSelection(
  options: ShippingOption[],
  selectedMethodId: string | null | undefined,
): {
  selected: ShippingOption | null;
  selectionChanged: boolean;
  cheapest: ShippingOption | null;
} {
  const cheapest = cheapestOf(options);
  if (!selectedMethodId) {
    return { selected: cheapest, selectionChanged: false, cheapest };
  }

  const chosen = options.find((o) => o.id === selectedMethodId);
  return chosen
    ? { selected: chosen, selectionChanged: false, cheapest }
    : { selected: cheapest, selectionChanged: true, cheapest };
}

/** Without a ruleset every method keeps its list price. */
export function computeShippingQuote(input: QuoteComputation): ShippingQuote {
  const { methods, snapshot, cart, currency } = input;

  if (!snapshot || input.killSwitch) {
    const options = methods.map(baseOption);
    return {
      options,
      disabledOptions: [],
      forcedMethodId: null,
      ...resolveSelection(options, input.selectedMethodId),
      currency,
      rulesetVersion: snapshot?.version ?? null,
      traceId: null,
      usedDefaults: true,
    };
  }

  const actor = input.actor ?? GUEST_ACTOR;
  const excludedByRules = new Set<string>();
  let forcedMethodId: string | null = null;
  let traceId: string | null = null;

  const evaluated = methods.map((method) => {
    const result = evaluateRuleSet(snapshot, {
      shipping: {
        methodId: method.id,
        methodLabel: method.label,
        baseCostCents: method.costCents,
      },
      cart,
      customer: actor.customer,
      session: actor.session,
    });
    traceId ??= result.traceId;

    const disabledMethods = result.decision.disabledMethods;
    if (Array.isArray(disabledMethods)) {
      for (const id of disabledMethods) {
        if (typeof id === "string") excludedByRules.add(id);
      }
    }
    if (typeof result.decision.forcedMethod === "string" && !forcedMethodId) {
      forcedMethodId = result.decision.forcedMethod;
    }

    return {
      ...baseOption(method),
      ...applyDecision(method, result.decision),
      matchedRules: result.matchedRules,
    };
  });

  // A forced method excludes the rest, but only if it exists: forcing a
  // missing method must not empty the list.
  const forcedExists =
    forcedMethodId !== null && evaluated.some((o) => o.id === forcedMethodId);
  const isExcluded = (option: ShippingOption) =>
    excludedByRules.has(option.id) ||
    (forcedExists && option.id !== forcedMethodId);

  const options = evaluated.filter((o) => !isExcluded(o));
  const disabledOptions = evaluated
    .filter(isExcluded)
    .map((o) => ({ ...o, disabled: true }));

  return {
    options,
    disabledOptions,
    forcedMethodId: forcedExists ? forcedMethodId : null,
    ...resolveSelection(options, input.selectedMethodId),
    currency,
    rulesetVersion: snapshot.version,
    traceId,
    usedDefaults: false,
  };
}
