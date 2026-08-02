/**
 * The fact catalog offered by the rule editor. A fact's type filters the
 * operators shown, and `categories` filters the facts by the ruleset being
 * edited. The list only informs the editor: the engine accepts any path, so
 * new context facts work without being listed here.
 */
import type { DecisionCategory, FactType } from "@ruleshop/rule-engine";

export interface FactDef {
  path: string;
  label: string;
  type: FactType;
  example?: string;
  /** Categories whose context contains this fact; absent means all. */
  categories?: DecisionCategory[];
  /** Gender and number of the label, for agreement in the generated sentence. */
  form?: "m" | "f" | "p";
  /** How the fact reads inside a sentence; `label` stays the editor's short form. */
  phrase?: string;
}

/** Categories evaluated for a single product. */
const PRODUCT_CATEGORIES: DecisionCategory[] = ["PRICING", "AVAILABILITY"];
/** Categories evaluated for a whole cart. */
const CART_CATEGORIES: DecisionCategory[] = ["SHIPPING", "FRAUD", "LOYALTY"];

export const FACTS: FactDef[] = [
  // Product
  { path: "product.basePriceCents", label: "Preț de bază (bani)", type: "number", example: "34900", categories: PRODUCT_CATEGORIES, phrase: "prețul de bază" },
  { path: "product.category", label: "Categoria produsului", type: "string", example: "audio", categories: PRODUCT_CATEGORIES, form: "f" },
  { path: "product.brand", label: "Brandul produsului", type: "string", categories: PRODUCT_CATEGORIES, phrase: "brandul produsului" },
  { path: "product.sku", label: "SKU", type: "string", categories: PRODUCT_CATEGORIES },
  { path: "product.stock", label: "Stoc disponibil", type: "number", categories: PRODUCT_CATEGORIES, phrase: "stocul disponibil" },
  { path: "product.tags", label: "Etichetele produsului", type: "array", example: "wireless, promo", categories: PRODUCT_CATEGORIES, form: "p" },

  // Customer
  { path: "customer.loyaltyTier", label: "Nivel de loialitate", type: "string", example: "VIP", phrase: "nivelul de loialitate" },
  { path: "customer.loyaltyPoints", label: "Puncte de loialitate", type: "number", form: "p", phrase: "punctele de loialitate" },
  { path: "customer.completedOrders", label: "Comenzi finalizate", type: "number", form: "p", phrase: "comenzile finalizate" },
  { path: "customer.lifetimeSpend", label: "Total cheltuit (bani)", type: "number", phrase: "totalul cheltuit" },
  { path: "customer.country", label: "Țara clientului", type: "string", example: "RO", form: "f" },
  { path: "customer.email", label: "Email client", type: "string", phrase: "emailul clientului" },
  { path: "customer.emailDomain", label: "Domeniul emailului", type: "string", example: "gmail.com", categories: ["FRAUD"] },

  // Cart
  { path: "cart.subtotalCents", label: "Subtotal coș (bani)", type: "number", example: "30000", categories: CART_CATEGORIES, phrase: "subtotalul coșului" },
  { path: "cart.itemCount", label: "Număr de produse în coș", type: "number", categories: CART_CATEGORIES, phrase: "numărul de produse din coș" },
  { path: "cart.categories", label: "Categoriile din coș", type: "array", example: "laptopuri, audio", categories: CART_CATEGORIES, form: "p" },
  { path: "cart.weightGrams", label: "Greutatea coșului (grame)", type: "number", example: "5000", categories: CART_CATEGORIES, form: "f", phrase: "greutatea coșului" },

  // Shipping — evaluated once per method, so rules can target one.
  { path: "shipping.methodId", label: "Metoda de livrare", type: "string", example: "curier-express", categories: ["SHIPPING"], form: "f" },
  { path: "shipping.baseCostCents", label: "Costul de listă al metodei (bani)", type: "number", categories: ["SHIPPING"], phrase: "costul de listă al metodei" },

  // Order — present only where the total is already known.
  { path: "order.totalCents", label: "Total comandă (bani)", type: "number", example: "150000", categories: ["FRAUD", "LOYALTY"], phrase: "totalul comenzii" },
  { path: "order.shippingCountry", label: "Țara de livrare", type: "string", example: "RO", categories: ["FRAUD"], form: "f" },
  { path: "order.billingCountry", label: "Țara de facturare", type: "string", example: "RO", categories: ["FRAUD"], form: "f" },
  { path: "order.addressMismatch", label: "Adresa de livrare diferă de facturare", type: "boolean", categories: ["FRAUD"] },
  { path: "order.paymentMethod", label: "Metoda de plată", type: "string", example: "card", categories: ["FRAUD", "LOYALTY"], form: "f" },

  // Session
  { path: "session.isGuest", label: "Este vizitator (fără cont)", type: "boolean" },
  { path: "session.isAuthenticated", label: "Este autentificat", type: "boolean" },

  // Session signals computed by the app: history, velocity, incidents.
  { path: "session.ipCountry", label: "Țara după IP", type: "string", example: "RO", categories: ["FRAUD"], form: "f" },
  { path: "session.ordersLastHour", label: "Comenzi în ultima oră", type: "number", example: "3", categories: ["FRAUD"], form: "p" },
  { path: "session.ordersLastDay", label: "Comenzi în ultimele 24h", type: "number", example: "5", categories: ["FRAUD"], form: "p" },
  { path: "session.priorBlocks", label: "Comenzi blocate anterior", type: "number", categories: ["FRAUD"], form: "p" },
  { path: "session.priorReviews", label: "Verificări manuale anterioare", type: "number", categories: ["FRAUD"], form: "p" },
  { path: "session.accountAgeDays", label: "Vechimea contului (zile)", type: "number", example: "30", categories: ["FRAUD"], form: "f", phrase: "vechimea contului" },

  // Time
  { path: "now", label: "Momentul evaluării (dată)", type: "date", phrase: "momentul evaluării" },
];

export function getFact(path: string): FactDef | undefined {
  return FACTS.find((f) => f.path === path);
}

/** The facts present in a given decision category's context. */
export function factsForCategory(category: DecisionCategory): FactDef[] {
  return FACTS.filter((f) => !f.categories || f.categories.includes(category));
}
