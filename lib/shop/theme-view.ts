/**
 * Tema si personalizarea vizuala — nucleul PUR (fara DB, fara sesiune, fara
 * server-only), ca sa poata fi folosit identic de magazin, de testerul din
 * control plane si de teste.
 *
 * Modelul deciziei: rulesetul THEME produce trei lucruri — un set de tokenuri
 * (culori si raze), un banner si o varianta de layout. Magazinul le aplica peste
 * tema implicita; nimic nu se recompileaza, deci un administrator poate schimba
 * aspectul magazinului dintr-o regula.
 *
 * SECURITATE — de ce stratul asta e mai paranoic decat celelalte:
 * valoarea unui token ajunge intr-o proprietate CSS. Un nume de token liber sau
 * o valoare nefiltrata ar insemna scriere arbitrara in stilul paginii (evadare
 * din declaratie, `url(...)`, etc). De aceea exista trei bariere independente:
 *   1. catalogul de actiuni accepta doar tokenuri din `THEME_TOKENS` si valori
 *      care trec `THEME_VALUE_PATTERN` — verificate la salvare si la publicare;
 *   2. functia de aici RE-valideaza ambele, pentru snapshot-uri publicate
 *      inainte de reguli mai stricte sau scrise direct prin API;
 *   3. rezultatul se aplica drept proprietati CSS custom pe un element (prin
 *      obiectul `style` al lui React), niciodata concatenat intr-un `<style>` —
 *      deci nu exista sintaxa CSS de evadat.
 * Ce nu trece nu se aplica, dar se raporteaza in `rejectedTokens`, ca
 * administratorul sa vada de ce regula lui nu are efect.
 *
 * Fail-safe: fara ruleset publicat (sau cu kill switch activ) magazinul arata
 * exact ca tema implicita din `globals.css`.
 */
import {
  evaluateRuleSet,
  THEME_BANNER_MAX_LENGTH,
  THEME_LAYOUT_VARIANTS,
  THEME_TOKENS,
  THEME_VALUE_PATTERN,
  type RuleSetSnapshot,
  type ThemeLayoutVariant,
  type ThemeToken,
} from "@/lib/engine";

/**
 * Tokenul de tema -> variabila CSS pe care o suprascrie. Cheile oglindesc
 * `@theme` din `globals.css`; maparea sta aici pentru ca numele variabilelor
 * sunt un detaliu de prezentare, nu vocabular al motorului.
 */
export const THEME_TOKEN_CSS_VARS: Record<ThemeToken, string> = {
  accent: "--color-accent",
  "accent-ink": "--color-accent-ink",
  surface: "--color-surface",
  "surface-raised": "--color-surface-raised",
  ink: "--color-ink",
  "ink-muted": "--color-ink-muted",
  line: "--color-line",
  positive: "--color-positive",
  caution: "--color-caution",
  critical: "--color-critical",
  "radius-card": "--radius-card",
};

/** Etichete pentru control plane — ce schimba fiecare token, in cuvinte. */
export const THEME_TOKEN_LABELS: Record<ThemeToken, string> = {
  accent: "Culoare de accent",
  "accent-ink": "Accent (text/hover)",
  surface: "Fundalul paginii",
  "surface-raised": "Fundalul cardurilor",
  ink: "Culoarea textului",
  "ink-muted": "Text secundar",
  line: "Culoarea liniilor",
  positive: "Culoare pozitivă",
  caution: "Culoare de avertizare",
  critical: "Culoare critică",
  "radius-card": "Rotunjirea cardurilor",
};

export const DEFAULT_LAYOUT_VARIANT: ThemeLayoutVariant = "default";

/** Ce inseamna fiecare variantă, pentru control plane. */
export const LAYOUT_VARIANT_LABELS: Record<ThemeLayoutVariant, string> = {
  default: "Implicit — 4 produse pe rând",
  compact: "Compact — mai multe produse pe rând, spații mici",
  spacious: "Spațios — produse mai mari, spații generoase",
};

/**
 * Densitatea grilei de catalog per variantă. Restul diferentelor (latimea
 * containerului) stau in `globals.css`, pe selectorul `[data-layout=...]`.
 */
export const CATALOG_GRID_CLASSES: Record<ThemeLayoutVariant, string> = {
  default: "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4",
  compact: "grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6",
  spacious: "grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3",
};

const VALUE_RE = new RegExp(THEME_VALUE_PATTERN);
const TOKEN_SET = new Set<string>(THEME_TOKENS);
const VARIANT_SET = new Set<string>(THEME_LAYOUT_VARIANTS);

export interface ActorFacts {
  customer: Record<string, unknown>;
  session: Record<string, unknown>;
}

const GUEST_ACTOR: ActorFacts = {
  customer: { loyaltyTier: "STANDARD", completedOrders: 0 },
  session: { isGuest: true, isAuthenticated: false },
};

export interface ThemeView {
  /** Tokenurile acceptate: nume de token -> valoare. */
  tokens: Partial<Record<ThemeToken, string>>;
  /**
   * Acelasi lucru, gata de aplicat: variabila CSS -> valoare. Se dă direct lui
   * React ca `style`, deci nu se construiește niciun text CSS.
   */
  cssVariables: Record<string, string>;
  banner: string | null;
  layoutVariant: ThemeLayoutVariant;
  /** Tokenuri respinse (nume necunoscut sau valoare invalidă), pentru control plane. */
  rejectedTokens: { token: string; value: unknown; reason: string }[];
  matchedRules: string[];
  rulesetVersion: number | null;
  traceId: string | null;
  /** true cand nu exista ruleset publicat sau kill switch-ul e activ. */
  usedDefaults: boolean;
}

export interface ThemeComputation {
  /** Snapshotul publicat; null => nu s-a publicat nimic. */
  snapshot: RuleSetSnapshot | null;
  killSwitch?: boolean;
  actor?: ActorFacts;
  /** Moment fix, pentru simulari reproductibile si campanii pe interval. */
  now?: string;
}

function defaultView(rulesetVersion: number | null): ThemeView {
  return {
    tokens: {},
    cssVariables: {},
    banner: null,
    layoutVariant: DEFAULT_LAYOUT_VARIANT,
    rejectedTokens: [],
    matchedRules: [],
    rulesetVersion,
    traceId: null,
    usedDefaults: true,
  };
}

/**
 * Tema decisa de rulesetul THEME. Functie pura: acelasi snapshot + acelasi
 * context => aceeasi tema.
 */
export function computeTheme(input: ThemeComputation): ThemeView {
  const { snapshot } = input;
  if (!snapshot || input.killSwitch) {
    return defaultView(snapshot?.version ?? null);
  }

  const actor = input.actor ?? GUEST_ACTOR;
  const result = evaluateRuleSet(snapshot, {
    ...(input.now ? { now: input.now } : {}),
    customer: actor.customer,
    session: actor.session,
  });
  const decision = result.decision;

  const tokens: Partial<Record<ThemeToken, string>> = {};
  const cssVariables: Record<string, string> = {};
  const rejectedTokens: ThemeView["rejectedTokens"] = [];

  const rawTokens =
    typeof decision.tokens === "object" && decision.tokens !== null
      ? (decision.tokens as Record<string, unknown>)
      : {};

  for (const [token, value] of Object.entries(rawTokens)) {
    if (!TOKEN_SET.has(token)) {
      rejectedTokens.push({ token, value, reason: "token necunoscut" });
      continue;
    }
    if (typeof value !== "string" || !VALUE_RE.test(value)) {
      rejectedTokens.push({ token, value, reason: "valoare invalidă" });
      continue;
    }
    tokens[token as ThemeToken] = value;
    cssVariables[THEME_TOKEN_CSS_VARS[token as ThemeToken]] = value;
  }

  const rawBanner = decision.banner;
  const banner =
    typeof rawBanner === "string" && rawBanner.trim() !== ""
      ? rawBanner.trim().slice(0, THEME_BANNER_MAX_LENGTH)
      : null;

  const rawVariant = decision.layoutVariant;
  const layoutVariant =
    typeof rawVariant === "string" && VARIANT_SET.has(rawVariant)
      ? (rawVariant as ThemeLayoutVariant)
      : DEFAULT_LAYOUT_VARIANT;

  return {
    tokens,
    cssVariables,
    banner,
    layoutVariant,
    rejectedTokens,
    matchedRules: result.matchedRules,
    rulesetVersion: result.rulesetVersion,
    traceId: result.traceId,
    usedDefaults: false,
  };
}

/** true cand tema chiar schimba ceva fata de implicit. */
export function hasThemeOverrides(view: ThemeView): boolean {
  return (
    Object.keys(view.tokens).length > 0 ||
    view.banner !== null ||
    view.layoutVariant !== DEFAULT_LAYOUT_VARIANT
  );
}

/** Rezumatul temei intr-o propozitie, pentru control plane si istoric. */
export function explainTheme(view: ThemeView): string {
  if (view.usedDefaults) return "Tema implicită a magazinului.";
  if (!hasThemeOverrides(view)) return "Nicio regulă nu schimbă tema.";

  const parts: string[] = [];
  const tokenCount = Object.keys(view.tokens).length;
  if (tokenCount > 0) {
    parts.push(`${tokenCount} ${tokenCount === 1 ? "token" : "tokenuri"} de stil`);
  }
  if (view.layoutVariant !== DEFAULT_LAYOUT_VARIANT) {
    parts.push(`layout ${view.layoutVariant}`);
  }
  if (view.banner) parts.push("banner");
  return `Modificate: ${parts.join(", ")}.`;
}
