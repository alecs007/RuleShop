import "server-only";
import { cache } from "react";
import { getActiveRuleset } from "@/lib/rules/service";
import { recordEvaluation } from "@/lib/rules/evaluation-log";
import { getEvaluationActor } from "./context";
import { computeTheme, type ThemeView } from "./theme-view";

export type { ThemeView } from "./theme-view";
export {
  DEFAULT_LAYOUT_VARIANT,
  explainTheme,
  hasThemeOverrides,
  LAYOUT_VARIANT_LABELS,
  THEME_TOKEN_CSS_VARS,
  THEME_TOKEN_LABELS,
} from "./theme-view";

const getThemeRuleset = cache(async (storeId: string) =>
  getActiveRuleset(storeId, "THEME"),
);

/**
 * Tema magazinului pentru vizitatorul curent.
 *
 * Cache per request: tema se cere din layout, din catalog si din testere, dar se
 * evalueaza o singura data. Evaluarea ajunge in istoric doar din layout (o data
 * pe pagina), altfel fiecare cerere ar scrie de mai multe ori acelasi eveniment.
 */
export const getThemeView = cache(
  async (storeId: string, record?: "layout"): Promise<ThemeView> => {
    const ruleset = await getThemeRuleset(storeId);
    const actor = await getEvaluationActor();

    const view = computeTheme({
      snapshot: ruleset?.snapshot ?? null,
      killSwitch: ruleset?.killSwitch,
      actor,
    });

    if (record && ruleset && !ruleset.killSwitch) {
      recordEvaluation({
        storeId,
        category: "THEME",
        context: { customer: actor.customer, session: actor.session },
        decision: {
          tokens: view.tokens,
          banner: view.banner,
          layoutVariant: view.layoutVariant,
        },
        matchedRuleKeys: view.matchedRules,
        rulesetVersion: view.rulesetVersion ?? 0,
        traceId: view.traceId,
        usedDefault: view.matchedRules.length === 0,
        source: record,
      });
    }

    return view;
  },
);
