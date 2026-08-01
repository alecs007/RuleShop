/**
 * Regulile demonstrative de start, pentru toate cele sase categorii de decizie.
 *
 * Rostul lor: un evaluator care deschide magazinul imediat dupa instalare
 * trebuie sa VADA motorul lucrand — prețuri modificate, livrare gratuită peste
 * un prag, comenzi suspecte oprite, plafoane de cantitate, puncte de loialitate
 * si o temă care se schimbă în funcție de client. Sunt un punct de plecare
 * plauzibil, nu un comportament impus: fiecare regulă se poate edita, dezactiva
 * sau șterge din control plane.
 *
 * Regulile sunt DATE, deci se pot descrie aici la fel ca in editor. Faptele,
 * operatorii si actiunile folosite sunt exact cele din cataloagele motorului —
 * `validateSnapshot` le verifica inainte de publicare (vezi
 * `lib/rules/provision.ts`), deci un set de start invalid nu trece in silentiu.
 *
 * Le foloseste si seed-ul demonstrativ, si crearea unui magazin nou din control
 * plane: un magazin proaspat porneste cu motorul deja functional.
 */
import type {
  ConditionNode,
  DecisionCategory,
  EngineRule,
} from "@ruleshop/rule-engine";

export interface SeedRule {
  key: string;
  name: string;
  description: string;
  priority: number;
  conditions: ConditionNode;
  actions: EngineRule["actions"];
}

// --- prescurtari pentru condiții, ca definițiile să se citească ca în editor --

const eq = (fact: string, value: unknown): ConditionNode => ({
  type: "condition",
  fact,
  operator: "eq",
  value,
});
const gte = (fact: string, value: number): ConditionNode => ({
  type: "condition",
  fact,
  operator: "gte",
  value,
});
const lte = (fact: string, value: number): ConditionNode => ({
  type: "condition",
  fact,
  operator: "lte",
  value,
});
const lt = (fact: string, value: number): ConditionNode => ({
  type: "condition",
  fact,
  operator: "lt",
  value,
});
const isTrue = (fact: string): ConditionNode => ({
  type: "condition",
  fact,
  operator: "isTrue",
});
const exists = (fact: string): ConditionNode => ({
  type: "condition",
  fact,
  operator: "exists",
});
const containsAny = (fact: string, value: string[]): ConditionNode => ({
  type: "condition",
  fact,
  operator: "containsAny",
  value,
});
const all = (...children: ConditionNode[]): ConditionNode => ({
  type: "group",
  op: "AND",
  children,
});

/** Prioritățile denumite din control plane (lib/rules/priority.ts). */
const NORMAL = 100;
const RIDICATA = 500;
const CRITICA = 1000;

// ---------------------------------------------------------------------------
// PRICING — strategia implicită e „cea mai avantajoasă pentru client", deci
// dintre regulile potrivite câștigă UNA, cea care lasă prețul cel mai mic.
// ---------------------------------------------------------------------------

const pricingRules: SeedRule[] = [
  {
    key: "vip-discount",
    name: "Reducere VIP",
    description:
      "Clienții VIP primesc 10% la orice produs. Se compară cu celelalte reduceri; clientul primește cea mai bună.",
    priority: RIDICATA,
    conditions: eq("customer.loyaltyTier", "VIP"),
    actions: [
      { type: "SET_DISCOUNT_PERCENT", params: { value: 10 } },
      { type: "ADD_PRICE_BADGE", params: { badge: "VIP" } },
    ],
  },
  {
    key: "promo-accesorii",
    name: "Promoție accesorii",
    description: "15% la toate accesoriile — campanie permanentă de volum.",
    priority: NORMAL,
    conditions: eq("product.category", "accesorii"),
    actions: [
      { type: "SET_DISCOUNT_PERCENT", params: { value: 15 } },
      { type: "ADD_PRICE_BADGE", params: { badge: "PROMO" } },
    ],
  },
  {
    key: "client-fidel",
    name: "Client fidel",
    description: "5% pentru clienții cu cel puțin 3 comenzi finalizate.",
    priority: NORMAL,
    conditions: gte("customer.completedOrders", 3),
    actions: [{ type: "SET_DISCOUNT_PERCENT", params: { value: 5 } }],
  },
  {
    key: "saptamana-wireless",
    name: "Săptămâna wireless",
    description:
      "12% la produsele etichetate „wireless”, ca exemplu de campanie pe etichete.",
    priority: NORMAL,
    conditions: containsAny("product.tags", ["wireless"]),
    actions: [
      { type: "SET_DISCOUNT_PERCENT", params: { value: 12 } },
      { type: "ADD_PRICE_BADGE", params: { badge: "WIRELESS" } },
    ],
  },
];

// ---------------------------------------------------------------------------
// SHIPPING — se evaluează o dată per metodă; metodele diferă de la magazin la
// magazin, deci regulile care vizează o metodă anume sunt parametrizate.
// ---------------------------------------------------------------------------

function shippingRules(methods: {
  express: string;
  locker: string;
}): SeedRule[] {
  return [
    {
      key: "livrare-gratuita-peste-prag",
      name: "Livrare gratuită peste 300",
      description:
        "Peste 300 (în moneda magazinului) livrarea e gratuită, indiferent de metodă.",
      priority: RIDICATA,
      conditions: gte("cart.subtotalCents", 30000),
      actions: [{ type: "FREE_SHIPPING", params: {} }],
    },
    {
      key: "vip-livrare-gratuita",
      name: "Livrare gratuită pentru VIP",
      description: "Clienții VIP nu plătesc niciodată livrarea.",
      priority: RIDICATA,
      conditions: eq("customer.loyaltyTier", "VIP"),
      actions: [{ type: "FREE_SHIPPING", params: {} }],
    },
    {
      key: "express-cos-greu",
      name: "Express pentru colete grele",
      description:
        "Expresul costă mai mult peste 5 kg — greutatea schimbă tariful curierului.",
      priority: NORMAL,
      conditions: all(
        eq("shipping.methodId", methods.express),
        gte("cart.weightGrams", 5000),
      ),
      actions: [{ type: "SET_SHIPPING_COST", params: { costCents: 4999 } }],
    },
    {
      key: "locker-fara-colete-mari",
      name: "Fără locker pentru colete mari",
      description:
        "Peste 10 kg coletul nu intră în locker, deci metoda se dezactivează.",
      priority: NORMAL,
      conditions: gte("cart.weightGrams", 10000),
      actions: [
        { type: "DISABLE_SHIPPING_METHOD", params: { method: methods.locker } },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// FRAUD — regulile adună scor; pragurile din defaultDecision traduc scorul în
// verdict (challenge 30 / review 55 / block 80). O regulă poate fixa direct
// decizia, iar atunci pragurile nu mai contează.
// ---------------------------------------------------------------------------

const fraudRules: SeedRule[] = [
  {
    key: "blocari-anterioare",
    name: "Blocat anterior",
    description:
      "Cine a mai avut o comandă blocată este blocat direct, fără a mai calcula scorul.",
    priority: CRITICA,
    conditions: gte("session.priorBlocks", 1),
    actions: [
      { type: "SET_FRAUD_DECISION", params: { decision: "BLOCK" } },
      { type: "FLAG_SIGNAL", params: { signal: "blocare anterioară" } },
    ],
  },
  {
    key: "comanda-mare-fara-cont",
    name: "Comandă mare fără cont",
    description: "Peste 5000 fără autentificare — +35 la scorul de risc.",
    priority: NORMAL,
    conditions: all(gte("order.totalCents", 500000), isTrue("session.isGuest")),
    actions: [
      { type: "ADD_RISK_SCORE", params: { value: 35 } },
      { type: "FLAG_SIGNAL", params: { signal: "comandă mare fără cont" } },
    ],
  },
  {
    key: "adrese-diferite",
    name: "Adrese diferite",
    description:
      "Livrarea și facturarea în orașe/țări diferite — semnal clasic de card furat.",
    priority: NORMAL,
    conditions: isTrue("order.addressMismatch"),
    actions: [
      { type: "ADD_RISK_SCORE", params: { value: 25 } },
      { type: "FLAG_SIGNAL", params: { signal: "adrese diferite" } },
    ],
  },
  {
    key: "viteza-comenzi",
    name: "Prea multe comenzi într-o oră",
    description:
      "3 sau mai multe comenzi în ultima oră de la aceeași identitate — +30.",
    priority: NORMAL,
    conditions: gte("session.ordersLastHour", 3),
    actions: [
      { type: "ADD_RISK_SCORE", params: { value: 30 } },
      { type: "FLAG_SIGNAL", params: { signal: "viteză de comandă" } },
    ],
  },
  {
    key: "cont-nou-comanda-mare",
    name: "Cont nou, comandă mare",
    description: "Cont mai nou de 7 zile care comandă peste 3000 — +20.",
    priority: NORMAL,
    conditions: all(
      lt("session.accountAgeDays", 7),
      gte("order.totalCents", 300000),
    ),
    actions: [
      { type: "ADD_RISK_SCORE", params: { value: 20 } },
      { type: "FLAG_SIGNAL", params: { signal: "cont nou" } },
    ],
  },
];

// ---------------------------------------------------------------------------
// AVAILABILITY — regulile pot doar să restrângă: stocul spune ce EXISTĂ,
// regulile spun ce se poate CUMPĂRA.
// ---------------------------------------------------------------------------

const availabilityRules: SeedRule[] = [
  {
    key: "prag-stoc-scazut",
    name: "Avertizare sub 10 bucăți",
    description:
      "Ridică pragul de „ultimele bucăți” de la 5 (implicit) la 10, pentru tot catalogul.",
    priority: NORMAL,
    conditions: exists("product.sku"),
    actions: [{ type: "SET_LOW_STOCK_THRESHOLD", params: { threshold: 10 } }],
  },
  {
    key: "limita-stoc-redus",
    name: "Plafon la stoc redus",
    description:
      "Sub 5 bucăți în stoc, un client poate lua maximum 2 — ca să nu golească stocul.",
    priority: RIDICATA,
    conditions: lte("product.stock", 5),
    actions: [
      { type: "LIMIT_QUANTITY", params: { maxQuantity: 2 } },
      { type: "ADD_AVAILABILITY_BADGE", params: { badge: "STOC LIMITAT" } },
    ],
  },
  {
    key: "flagship-o-bucata",
    name: "Flagship: o bucată per comandă",
    description:
      "Produsele „flagship” se vând câte una per comandă, ca să nu fie cumpărate pentru revânzare.",
    priority: CRITICA,
    conditions: containsAny("product.tags", ["flagship"]),
    actions: [
      { type: "LIMIT_QUANTITY", params: { maxQuantity: 1 } },
      { type: "ADD_AVAILABILITY_BADGE", params: { badge: "1 / COMANDĂ" } },
    ],
  },
  {
    key: "mesaj-stoc-epuizat",
    name: "Mesaj la stoc epuizat",
    description: "Un text mai prietenos decât „Stoc epuizat” când stocul e 0.",
    priority: NORMAL,
    conditions: lte("product.stock", 0),
    actions: [
      {
        type: "SET_AVAILABILITY_MESSAGE",
        params: { message: "Stoc epuizat — revine în aproximativ o săptămână" },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// LOYALTY — punctele de bază vin din valoarea coșului; regulile multiplică,
// adaugă bonus, acordă beneficii și pot ridica nivelul afișat.
// ---------------------------------------------------------------------------

const loyaltyRules: SeedRule[] = [
  {
    key: "vip-puncte-duble",
    name: "Puncte duble pentru VIP",
    description: "Clienții VIP acumulează dublu și au retur extins.",
    priority: RIDICATA,
    conditions: eq("customer.loyaltyTier", "VIP"),
    actions: [
      { type: "SET_POINTS_MULTIPLIER", params: { factor: 2 } },
      { type: "GRANT_BENEFIT", params: { benefit: "retur extins la 60 de zile" } },
    ],
  },
  {
    key: "promovare-gold",
    name: "Promovare la nivelul GOLD",
    description:
      "De la 5 comenzi finalizate, clientul e tratat ca GOLD. Nivelul e recalculat la fiecare evaluare, nu salvat în cont.",
    priority: RIDICATA,
    conditions: gte("customer.completedOrders", 5),
    actions: [
      { type: "SET_LOYALTY_TIER", params: { tier: "GOLD" } },
      { type: "GRANT_BENEFIT", params: { benefit: "suport prioritar" } },
    ],
  },
  {
    key: "bonus-cos-mare",
    name: "Bonus pentru coș mare",
    description: "100 de puncte bonus peste 500 în coș.",
    priority: NORMAL,
    conditions: gte("cart.subtotalCents", 50000),
    actions: [{ type: "GRANT_BONUS_POINTS", params: { points: 100 } }],
  },
  {
    key: "bun-venit-prima-comanda",
    name: "Bun venit la prima comandă",
    description:
      "Un client autentificat fără comenzi finalizate primește 50 de puncte la prima comandă.",
    priority: NORMAL,
    conditions: all(
      eq("customer.completedOrders", 0),
      isTrue("session.isAuthenticated"),
    ),
    actions: [
      { type: "GRANT_BONUS_POINTS", params: { points: 50 } },
      { type: "GRANT_BENEFIT", params: { benefit: "bun venit: 50 de puncte" } },
    ],
  },
];

// ---------------------------------------------------------------------------
// THEME — aspectul magazinului, decis de reguli. Tokenurile și variantele sunt
// dintr-o listă închisă; o valoare în afara formatului permis este respinsă.
// ---------------------------------------------------------------------------

function themeRules(accent: {
  hex: string;
  ink: string;
  countryCode: string;
}): SeedRule[] {
  return [
    {
      key: "tema-vip",
      name: "Temă VIP",
      description:
        "Clienții VIP văd magazinul în violet, cu un banner care le confirmă statutul.",
      priority: RIDICATA,
      conditions: eq("customer.loyaltyTier", "VIP"),
      actions: [
        { type: "SET_THEME_TOKEN", params: { token: "accent", value: "#7c3aed" } },
        {
          type: "SET_THEME_TOKEN",
          params: { token: "accent-ink", value: "#6d28d9" },
        },
        {
          type: "SET_BANNER",
          params: { message: "Bine ai revenit! Beneficiile VIP sunt active." },
        },
      ],
    },
    {
      key: "banner-vizitatori",
      name: "Banner pentru vizitatori",
      description:
        "Cine nu are cont vede invitația de înregistrare — aceeași regulă de bun venit ca la loialitate.",
      priority: NORMAL,
      conditions: isTrue("session.isGuest"),
      actions: [
        {
          type: "SET_BANNER",
          params: {
            message:
              "Creează un cont și primești 50 de puncte la prima comandă.",
          },
        },
      ],
    },
    {
      key: "accent-local",
      name: "Accent local",
      description:
        "Culoarea de accent a magazinului pentru clienții din țara lui — o „variantă” de magazin fără fork de cod.",
      priority: NORMAL,
      conditions: eq("customer.country", accent.countryCode),
      actions: [
        {
          type: "SET_THEME_TOKEN",
          params: { token: "accent", value: accent.hex },
        },
        {
          type: "SET_THEME_TOKEN",
          params: { token: "accent-ink", value: accent.ink },
        },
      ],
    },
    {
      key: "layout-compact-clienti-fideli",
      name: "Layout compact pentru clienți fideli",
      description:
        "Clienții cu 5+ comenzi știu catalogul: văd mai multe produse pe rând.",
      priority: NORMAL,
      conditions: gte("customer.completedOrders", 5),
      actions: [
        { type: "SET_LAYOUT_VARIANT", params: { variant: "compact" } },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------

export interface StoreRuleOptions {
  /** Id-urile metodelor de livrare vizate de reguli (diferă per magazin). */
  shipping: { express: string; locker: string };
  /** Accentul „local" și țara pentru care se aplică. */
  theme: { hex: string; ink: string; countryCode: string };
}

/** Setul complet de reguli de start pentru un magazin, pe categorii. */
export function seedRulesFor(
  options: StoreRuleOptions,
): Record<DecisionCategory, SeedRule[]> {
  return {
    PRICING: pricingRules,
    SHIPPING: shippingRules(options.shipping),
    FRAUD: fraudRules,
    AVAILABILITY: availabilityRules,
    LOYALTY: loyaltyRules,
    THEME: themeRules(options.theme),
  };
}
