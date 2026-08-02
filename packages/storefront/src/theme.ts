/**
 * The THEME ruleset decides style tokens, a banner and a layout variant.
 *
 * Token values end up in CSS properties, so three independent barriers stand
 * in the way of arbitrary styling: the action catalog accepts only known
 * tokens and values matching `THEME_VALUE_PATTERN` (on save and on publish);
 * `computeTheme` re-validates both, for snapshots published before stricter
 * rules or written through the API; and the result is applied as custom CSS
 * properties, never as concatenated CSS text. Rejected tokens are reported in
 * `rejectedTokens` so an admin can see why a rule has no effect.
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
} from "@ruleshop/rule-engine";
import type { ActorFacts } from "./types";

/** Token -> the CSS variable it overrides. Keys mirror `@theme` in globals.css. */
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

export const LAYOUT_VARIANT_LABELS: Record<ThemeLayoutVariant, string> = {
  default: "Implicit — 4 produse pe rând",
  compact: "Compact — mai multe produse pe rând, spații mici",
  spacious: "Spațios — produse mai mari, spații generoase",
};

/** Grid density per variant; the rest lives on `[data-layout=...]` in CSS. */
export const CATALOG_GRID_CLASSES: Record<ThemeLayoutVariant, string> = {
  default: "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4",
  compact: "grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6",
  spacious: "grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3",
};

const VALUE_RE = new RegExp(THEME_VALUE_PATTERN);
const TOKEN_SET = new Set<string>(THEME_TOKENS);
const VARIANT_SET = new Set<string>(THEME_LAYOUT_VARIANTS);


const GUEST_ACTOR: ActorFacts = {
  customer: { loyaltyTier: "STANDARD", completedOrders: 0 },
  session: { isGuest: true, isAuthenticated: false },
};

export interface ThemeView {
  /** The accepted tokens: token name -> value. */
  tokens: Partial<Record<ThemeToken, string>>;
  /** The same, ready to apply: CSS variable -> value, handed to React as `style`. */
  cssVariables: Record<string, string>;
  banner: string | null;
  layoutVariant: ThemeLayoutVariant;
  /** Unknown names or invalid values, surfaced in the control plane. */
  rejectedTokens: { token: string; value: unknown; reason: string }[];
  matchedRules: string[];
  rulesetVersion: number | null;
  traceId: string | null;
  /** true when no ruleset is published or the kill switch is on. */
  usedDefaults: boolean;
}

export interface ThemeComputation {
  /** The published snapshot; null means nothing has been published. */
  snapshot: RuleSetSnapshot | null;
  killSwitch?: boolean;
  actor?: ActorFacts;
  /** Fixed instant, for reproducible simulations. */
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

export function hasThemeOverrides(view: ThemeView): boolean {
  return (
    Object.keys(view.tokens).length > 0 ||
    view.banner !== null ||
    view.layoutVariant !== DEFAULT_LAYOUT_VARIANT
  );
}

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
