import { describe, expect, it } from "vitest";
import type { ConditionNode, EngineRule, RuleSetSnapshot } from "@/lib/engine/types";
import { validateRule } from "@/lib/engine/schemas";
import {
  computeTheme,
  explainTheme,
  hasThemeOverrides,
  THEME_TOKEN_CSS_VARS,
  type ActorFacts,
  type ThemeComputation,
} from "@/lib/shop/theme-view";

const VIP: ActorFacts = {
  customer: { loyaltyTier: "VIP", completedOrders: 20, country: "RO" },
  session: { isGuest: false, isAuthenticated: true },
};

const GUEST: ActorFacts = {
  customer: { loyaltyTier: "STANDARD", completedOrders: 0 },
  session: { isGuest: true, isAuthenticated: false },
};

function rule(
  key: string,
  conditions: ConditionNode,
  actions: EngineRule["actions"],
  priority = 100,
): EngineRule {
  return { key, name: key, priority, enabled: true, conditions, actions };
}

function snapshot(
  rules: EngineRule[],
  overrides: Partial<RuleSetSnapshot> = {},
): RuleSetSnapshot {
  return {
    key: "theme",
    category: "THEME",
    version: 2,
    conflictStrategy: "PRIORITY_ALL_MATCHES",
    defaultDecision: { tokens: {}, banner: null, layoutVariant: "default" },
    rules,
    ...overrides,
  };
}

const isVip: ConditionNode = {
  type: "condition",
  fact: "customer.loyaltyTier",
  operator: "eq",
  value: "VIP",
};

const isGuest: ConditionNode = {
  type: "condition",
  fact: "session.isGuest",
  operator: "isTrue",
};

function view(snap: RuleSetSnapshot | null, extra: Partial<ThemeComputation> = {}) {
  return computeTheme({ snapshot: snap, actor: VIP, ...extra });
}

describe("computeTheme — comportament implicit", () => {
  it("fără ruleset publicat păstrează tema implicită", () => {
    const result = view(null);
    expect(result.usedDefaults).toBe(true);
    expect(result.tokens).toEqual({});
    expect(result.cssVariables).toEqual({});
    expect(result.banner).toBeNull();
    expect(result.layoutVariant).toBe("default");
    expect(hasThemeOverrides(result)).toBe(false);
  });

  it("kill switch-ul readuce tema implicită", () => {
    const snap = snapshot([
      rule("vip", isVip, [
        { type: "SET_THEME_TOKEN", params: { token: "accent", value: "#7c3aed" } },
      ]),
    ]);
    const result = view(snap, { killSwitch: true });
    expect(result.usedDefaults).toBe(true);
    expect(result.tokens).toEqual({});
    expect(result.rulesetVersion).toBe(2);
  });
});

describe("computeTheme — acțiuni", () => {
  it("aplică tokenurile ca variabile CSS", () => {
    const snap = snapshot([
      rule("vip", isVip, [
        { type: "SET_THEME_TOKEN", params: { token: "accent", value: "#7c3aed" } },
        {
          type: "SET_THEME_TOKEN",
          params: { token: "radius-card", value: "1.5rem" },
        },
      ]),
    ]);
    const result = view(snap);
    expect(result.tokens).toEqual({ accent: "#7c3aed", "radius-card": "1.5rem" });
    expect(result.cssVariables).toEqual({
      [THEME_TOKEN_CSS_VARS.accent]: "#7c3aed",
      [THEME_TOKEN_CSS_VARS["radius-card"]]: "1.5rem",
    });
    expect(result.matchedRules).toEqual(["vip"]);
    expect(hasThemeOverrides(result)).toBe(true);
  });

  it("aplică bannerul și varianta de layout", () => {
    const snap = snapshot([
      rule("vip", isVip, [
        { type: "SET_BANNER", params: { message: "  Beneficii VIP active  " } },
        { type: "SET_LAYOUT_VARIANT", params: { variant: "compact" } },
      ]),
    ]);
    const result = view(snap);
    expect(result.banner).toBe("Beneficii VIP active");
    expect(result.layoutVariant).toBe("compact");
  });

  it("nu aplică nimic unui vizitator care nu se potrivește", () => {
    const snap = snapshot([
      rule("vip", isVip, [
        { type: "SET_THEME_TOKEN", params: { token: "accent", value: "#7c3aed" } },
      ]),
    ]);
    const result = view(snap, { actor: GUEST });
    expect(result.tokens).toEqual({});
    expect(result.matchedRules).toEqual([]);
    expect(result.usedDefaults).toBe(false);
  });

  it("prioritatea mai mare are ultimul cuvânt pe același token", () => {
    const snap = snapshot([
      rule(
        "general",
        isGuest,
        [{ type: "SET_THEME_TOKEN", params: { token: "accent", value: "#111111" } }],
        100,
      ),
      rule(
        "campanie",
        isGuest,
        [{ type: "SET_THEME_TOKEN", params: { token: "accent", value: "#ff0000" } }],
        500,
      ),
    ]);
    expect(view(snap, { actor: GUEST }).tokens.accent).toBe("#ff0000");
  });
});

describe("computeTheme — bariera de securitate", () => {
  it("respinge tokenuri din afara listei permise", () => {
    const snap = snapshot([], {
      defaultDecision: { tokens: { "background-image": "url(http://x/y.png)" } },
    });
    const result = view(snap);
    expect(result.tokens).toEqual({});
    expect(result.cssVariables).toEqual({});
    expect(result.rejectedTokens).toEqual([
      {
        token: "background-image",
        value: "url(http://x/y.png)",
        reason: "token necunoscut",
      },
    ]);
  });

  it("respinge valori care ar putea evada din declarația CSS", () => {
    const attacks = [
      "red; } body { display: none",
      "url(javascript:alert(1))",
      "#fff /* comentariu */",
      "var(--altceva)",
      "expression(alert(1))",
      "#gggggg",
      "",
    ];
    for (const value of attacks) {
      const snap = snapshot([], { defaultDecision: { tokens: { accent: value } } });
      const result = view(snap);
      expect(result.tokens.accent, `„${value}" nu trebuie acceptat`).toBeUndefined();
      expect(result.rejectedTokens).toHaveLength(1);
      expect(result.rejectedTokens[0]!.reason).toBe("valoare invalidă");
    }
  });

  it("acceptă formele legitime de culoare și lungime", () => {
    const valid = ["#fff", "#2563eb", "#2563ebcc", "rgb(37, 99, 235)", "0.75rem", "12px"];
    for (const value of valid) {
      const snap = snapshot([], { defaultDecision: { tokens: { accent: value } } });
      const result = view(snap);
      expect(result.tokens.accent, `„${value}" trebuie acceptat`).toBe(value);
      expect(result.rejectedTokens).toEqual([]);
    }
  });

  it("respinge o variantă de layout necunoscută și cade pe implicit", () => {
    const snap = snapshot([], {
      defaultDecision: { layoutVariant: "../../etc/passwd" },
    });
    expect(view(snap).layoutVariant).toBe("default");
  });

  it("taie un banner mai lung decât limita", () => {
    const snap = snapshot([], { defaultDecision: { banner: "x".repeat(500) } });
    expect(view(snap).banner).toHaveLength(160);
  });

  it("ignoră un banner care nu e text", () => {
    const snap = snapshot([], { defaultDecision: { banner: { evil: true } } });
    expect(view(snap).banner).toBeNull();
  });
});

describe("validarea regulilor de temă", () => {
  it("respinge un token în afara listei, la salvare", () => {
    const issues = validateRule(
      rule("rea", isVip, [
        {
          type: "SET_THEME_TOKEN",
          params: { token: "background", value: "#fff" },
        },
      ]),
      "THEME",
    );
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("respinge o valoare de culoare care nu are formă permisă", () => {
    const issues = validateRule(
      rule("rea", isVip, [
        {
          type: "SET_THEME_TOKEN",
          params: { token: "accent", value: "red; } body {" },
        },
      ]),
      "THEME",
    );
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("respinge un banner prea lung", () => {
    const issues = validateRule(
      rule("rea", isVip, [
        { type: "SET_BANNER", params: { message: "x".repeat(300) } },
      ]),
      "THEME",
    );
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("acceptă o regulă de temă corectă", () => {
    const issues = validateRule(
      rule("buna", isVip, [
        { type: "SET_THEME_TOKEN", params: { token: "accent", value: "#7c3aed" } },
        { type: "SET_LAYOUT_VARIANT", params: { variant: "compact" } },
        { type: "SET_BANNER", params: { message: "Beneficii VIP active" } },
      ]),
      "THEME",
    );
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("explicații", () => {
  it("descrie ce s-a schimbat", () => {
    const snap = snapshot([
      rule("vip", isVip, [
        { type: "SET_THEME_TOKEN", params: { token: "accent", value: "#7c3aed" } },
        { type: "SET_BANNER", params: { message: "Salut" } },
        { type: "SET_LAYOUT_VARIANT", params: { variant: "compact" } },
      ]),
    ]);
    const text = explainTheme(view(snap));
    expect(text).toContain("1 token");
    expect(text).toContain("layout compact");
    expect(text).toContain("banner");
  });

  it("spune când tema e cea implicită", () => {
    expect(explainTheme(view(null))).toContain("implicită");
  });
});
