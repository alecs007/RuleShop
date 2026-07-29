/**
 * Cotatia de livrare — nucleul PUR (fara DB, fara sesiune, fara server-only),
 * ca sa poata fi folosit identic de magazin, de testerul din control plane si
 * de teste.
 *
 * Ideea centrala: rulesetul SHIPPING se evalueaza O DATA PER METODA, cu
 * `shipping.methodId` in context. Astfel o regula poate viza o metoda anume
 * („DACA metoda este curier-express ATUNCI cost 25 lei"), nu doar livrarea in
 * bloc. Deciziile care nu privesc costul (metode dezactivate, metoda impusa)
 * se colecteaza global: o regula poate exclude o metoda in timp ce motorul
 * evalueaza o alta.
 */
import { evaluateRuleSet, type RuleSetSnapshot } from "@/lib/engine";
import type { ShippingMethod } from "./shipping-methods";

export interface ShippingOption {
  id: string;
  label: string;
  /** Costul de lista, inainte de reguli. */
  baseCostCents: number;
  /** Costul final, dupa reguli. */
  costCents: number;
  free: boolean;
  etaDaysMin: number;
  etaDaysMax: number;
  /** Metoda a fost exclusa de o regula. */
  disabled: boolean;
  /** Cheile regulilor care au modificat aceasta metoda. */
  matchedRules: string[];
}

export interface ShippingQuote {
  /** Metodele disponibile, in ordinea configurata de magazin. */
  options: ShippingOption[];
  /** Metodele excluse de reguli — utile pentru explicatia deciziei. */
  disabledOptions: ShippingOption[];
  /** Metoda impusa de o regula, daca exista. */
  forcedMethodId: string | null;
  /** Metoda pe care se calculeaza totalul (alegerea clientului sau implicita). */
  selected: ShippingOption | null;
  /** true cand alegerea clientului nu mai este disponibila si s-a inlocuit. */
  selectionChanged: boolean;
  /** Cea mai ieftina metoda disponibila (costul de la care pornește livrarea). */
  cheapest: ShippingOption | null;
  currency: string;
  rulesetVersion: number | null;
  traceId: string | null;
  /** true cand nu exista ruleset publicat sau kill switch-ul e activ. */
  usedDefaults: boolean;
}

/** Faptele despre cos folosite de regulile de livrare. */
export interface CartShippingFacts {
  subtotalCents: number;
  itemCount: number;
  weightGrams: number;
  categories: string[];
}

export interface ActorFacts {
  customer: Record<string, unknown>;
  session: Record<string, unknown>;
}

const GUEST_ACTOR: ActorFacts = {
  customer: { loyaltyTier: "STANDARD", completedOrders: 0 },
  session: { isGuest: true, isAuthenticated: false },
};

export interface QuoteComputation {
  methods: ShippingMethod[];
  /** Snapshotul publicat; null => nu s-a publicat nimic. */
  snapshot: RuleSetSnapshot | null;
  killSwitch?: boolean;
  cart: CartShippingFacts;
  currency: string;
  actor?: ActorFacts;
  /** Metoda aleasa de client, daca a ales una. */
  selectedMethodId?: string | null;
}

/** Optiunea „de lista": metoda asa cum e configurata, inainte de reguli. */
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

/** Aplica decizia SHIPPING peste o metoda de livrare. */
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

/**
 * Cea mai ieftina metoda disponibila. La cost egal câștigă prima din ordinea
 * de afisare a magazinului.
 */
function cheapestOf(options: ShippingOption[]): ShippingOption | null {
  return options.reduce<ShippingOption | null>(
    (best, option) => (best === null || option.costCents < best.costCents ? option : best),
    null,
  );
}

/**
 * Metoda pe care se calculeaza totalul: alegerea clientului daca e inca
 * disponibila, altfel cea mai ieftina. `selectionChanged` semnaleaza cazul in
 * care o regula a scos metoda aleasa, ca sa i se poata spune clientului.
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

/**
 * Cotatia completa. Fara ruleset publicat (sau cu kill switch activ) fiecare
 * metoda isi pastreaza costul de lista — magazinul rămâne functional chiar
 * daca regulile sunt oprite.
 */
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

  // O metoda impusa exclude toate celelalte — dar numai daca exista: o regula
  // care impune o metoda inexistenta nu trebuie sa goleasca lista.
  const forcedExists =
    forcedMethodId !== null && evaluated.some((o) => o.id === forcedMethodId);
  const isExcluded = (option: ShippingOption) =>
    excludedByRules.has(option.id) ||
    (forcedExists && option.id !== forcedMethodId);

  // Ordinea de afisare rămâne cea configurata de magazin; costul decide doar
  // care metoda e "cea mai ieftina" si, implicit, care e preselectata.
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
