/**
 * Catalogul de fapte disponibile in editorul de reguli.
 *
 * Tipul fiecarui fact filtreaza operatorii oferiti (compatibilitate ceruta de
 * barem), iar `categories` filtreaza faptele in functie de rulesetul editat —
 * un fapt despre metoda de livrare nu are sens intr-o regula de preț, unde nu
 * ar exista niciodata in context.
 *
 * Lista e informativa pentru editor — motorul accepta orice cale, deci faptele
 * noi adaugate in context functioneaza si fara modificari aici.
 */
import type { DecisionCategory, FactType } from "@ruleshop/rule-engine";

export interface FactDef {
  path: string;
  label: string;
  type: FactType;
  example?: string;
  /** Categoriile in contextul carora exista faptul; lipsa => toate. */
  categories?: DecisionCategory[];
  /**
   * Forma gramaticala a etichetei, pentru acordul din propozitia generata:
   * masculin (implicit), feminin sau plural. Fara ea ar ieși „țara este egal
   * cu" in loc de „țara este egală cu".
   */
  form?: "m" | "f" | "p";
  /**
   * Forma articulata folosita in propozitia generata. `label` rămâne eticheta
   * scurta din editor („Preț de bază (bani)"), iar `phrase` e cea care se
   * citește in frază („prețul de bază") — unitatea nu se repetă, pentru că
   * valoarea e deja formatată.
   */
  phrase?: string;
}

/** Categoriile evaluate pentru un singur produs. */
const PRODUCT_CATEGORIES: DecisionCategory[] = ["PRICING", "AVAILABILITY"];
/** Categoriile evaluate pentru un cos intreg. */
const CART_CATEGORIES: DecisionCategory[] = ["SHIPPING", "FRAUD", "LOYALTY"];

export const FACTS: FactDef[] = [
  // Produs (contextul evaluarilor de PRICING / AVAILABILITY per produs)
  { path: "product.basePriceCents", label: "Preț de bază (bani)", type: "number", example: "34900", categories: PRODUCT_CATEGORIES, phrase: "prețul de bază" },
  { path: "product.category", label: "Categoria produsului", type: "string", example: "audio", categories: PRODUCT_CATEGORIES, form: "f" },
  { path: "product.brand", label: "Brandul produsului", type: "string", categories: PRODUCT_CATEGORIES, phrase: "brandul produsului" },
  { path: "product.sku", label: "SKU", type: "string", categories: PRODUCT_CATEGORIES },
  { path: "product.stock", label: "Stoc disponibil", type: "number", categories: PRODUCT_CATEGORIES, phrase: "stocul disponibil" },
  { path: "product.tags", label: "Etichetele produsului", type: "array", example: "wireless, promo", categories: PRODUCT_CATEGORIES, form: "p" },

  // Client
  { path: "customer.loyaltyTier", label: "Nivel de loialitate", type: "string", example: "VIP", phrase: "nivelul de loialitate" },
  { path: "customer.loyaltyPoints", label: "Puncte de loialitate", type: "number", form: "p", phrase: "punctele de loialitate" },
  { path: "customer.completedOrders", label: "Comenzi finalizate", type: "number", form: "p", phrase: "comenzile finalizate" },
  { path: "customer.lifetimeSpend", label: "Total cheltuit (bani)", type: "number", phrase: "totalul cheltuit" },
  { path: "customer.country", label: "Țara clientului", type: "string", example: "RO", form: "f" },
  { path: "customer.email", label: "Email client", type: "string", phrase: "emailul clientului" },
  { path: "customer.emailDomain", label: "Domeniul emailului", type: "string", example: "gmail.com", categories: ["FRAUD"] },

  // Cos (contextul evaluarilor de SHIPPING / FRAUD / LOYALTY la checkout)
  { path: "cart.subtotalCents", label: "Subtotal coș (bani)", type: "number", example: "30000", categories: CART_CATEGORIES, phrase: "subtotalul coșului" },
  { path: "cart.itemCount", label: "Număr de produse în coș", type: "number", categories: CART_CATEGORIES, phrase: "numărul de produse din coș" },
  { path: "cart.categories", label: "Categoriile din coș", type: "array", example: "laptopuri, audio", categories: CART_CATEGORIES, form: "p" },
  { path: "cart.weightGrams", label: "Greutatea coșului (grame)", type: "number", example: "5000", categories: CART_CATEGORIES, form: "f", phrase: "greutatea coșului" },

  // Livrare — rulesetul SHIPPING se evalueaza o data per metoda, deci
  // regulile pot viza o metoda anume.
  { path: "shipping.methodId", label: "Metoda de livrare", type: "string", example: "curier-express", categories: ["SHIPPING"], form: "f" },
  { path: "shipping.baseCostCents", label: "Costul de listă al metodei (bani)", type: "number", categories: ["SHIPPING"], phrase: "costul de listă al metodei" },

  // Comanda care se plaseaza — exista la verificarea antifrauda si la calculul
  // recompenselor, adica in punctele in care totalul e deja cunoscut.
  { path: "order.totalCents", label: "Total comandă (bani)", type: "number", example: "150000", categories: ["FRAUD", "LOYALTY"], phrase: "totalul comenzii" },
  { path: "order.shippingCountry", label: "Țara de livrare", type: "string", example: "RO", categories: ["FRAUD"], form: "f" },
  { path: "order.billingCountry", label: "Țara de facturare", type: "string", example: "RO", categories: ["FRAUD"], form: "f" },
  { path: "order.addressMismatch", label: "Adresa de livrare diferă de facturare", type: "boolean", categories: ["FRAUD"] },
  { path: "order.paymentMethod", label: "Metoda de plată", type: "string", example: "card", categories: ["FRAUD", "LOYALTY"], form: "f" },

  // Sesiune
  { path: "session.isGuest", label: "Este vizitator (fără cont)", type: "boolean" },
  { path: "session.isAuthenticated", label: "Este autentificat", type: "boolean" },

  // Semnale de sesiune calculate de aplicatie (istoric, viteza, incidente)
  { path: "session.ipCountry", label: "Țara după IP", type: "string", example: "RO", categories: ["FRAUD"], form: "f" },
  { path: "session.ordersLastHour", label: "Comenzi în ultima oră", type: "number", example: "3", categories: ["FRAUD"], form: "p" },
  { path: "session.ordersLastDay", label: "Comenzi în ultimele 24h", type: "number", example: "5", categories: ["FRAUD"], form: "p" },
  { path: "session.priorBlocks", label: "Comenzi blocate anterior", type: "number", categories: ["FRAUD"], form: "p" },
  { path: "session.priorReviews", label: "Verificări manuale anterioare", type: "number", categories: ["FRAUD"], form: "p" },
  { path: "session.accountAgeDays", label: "Vechimea contului (zile)", type: "number", example: "30", categories: ["FRAUD"], form: "f", phrase: "vechimea contului" },

  // Timp
  { path: "now", label: "Momentul evaluării (dată)", type: "date", phrase: "momentul evaluării" },
];

export function getFact(path: string): FactDef | undefined {
  return FACTS.find((f) => f.path === path);
}

/** Faptele care exista in contextul unei categorii de decizie. */
export function factsForCategory(category: DecisionCategory): FactDef[] {
  return FACTS.filter((f) => !f.categories || f.categories.includes(category));
}
