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
import type { DecisionCategory, FactType } from "@/lib/engine";

export interface FactDef {
  path: string;
  label: string;
  type: FactType;
  example?: string;
  /** Categoriile in contextul carora exista faptul; lipsa => toate. */
  categories?: DecisionCategory[];
}

/** Categoriile evaluate pentru un singur produs. */
const PRODUCT_CATEGORIES: DecisionCategory[] = ["PRICING", "AVAILABILITY"];
/** Categoriile evaluate pentru un cos intreg. */
const CART_CATEGORIES: DecisionCategory[] = ["SHIPPING", "FRAUD", "LOYALTY"];

export const FACTS: FactDef[] = [
  // Produs (contextul evaluarilor de PRICING / AVAILABILITY per produs)
  { path: "product.basePriceCents", label: "Preț de bază (bani)", type: "number", example: "34900", categories: PRODUCT_CATEGORIES },
  { path: "product.category", label: "Categoria produsului", type: "string", example: "audio", categories: PRODUCT_CATEGORIES },
  { path: "product.brand", label: "Brandul produsului", type: "string", categories: PRODUCT_CATEGORIES },
  { path: "product.sku", label: "SKU", type: "string", categories: PRODUCT_CATEGORIES },
  { path: "product.stock", label: "Stoc disponibil", type: "number", categories: PRODUCT_CATEGORIES },
  { path: "product.tags", label: "Etichetele produsului", type: "array", example: "wireless, promo", categories: PRODUCT_CATEGORIES },

  // Client
  { path: "customer.loyaltyTier", label: "Nivel de loialitate", type: "string", example: "VIP" },
  { path: "customer.loyaltyPoints", label: "Puncte de loialitate", type: "number" },
  { path: "customer.completedOrders", label: "Comenzi finalizate", type: "number" },
  { path: "customer.lifetimeSpend", label: "Total cheltuit (bani)", type: "number" },
  { path: "customer.country", label: "Țara clientului", type: "string", example: "RO" },
  { path: "customer.email", label: "Email client", type: "string" },

  // Cos (contextul evaluarilor de SHIPPING / FRAUD / LOYALTY la checkout)
  { path: "cart.subtotalCents", label: "Subtotal coș (bani)", type: "number", example: "30000", categories: CART_CATEGORIES },
  { path: "cart.itemCount", label: "Număr de produse în coș", type: "number", categories: CART_CATEGORIES },
  { path: "cart.categories", label: "Categoriile din coș", type: "array", example: "laptopuri, audio", categories: CART_CATEGORIES },
  { path: "cart.weightGrams", label: "Greutatea coșului (grame)", type: "number", example: "5000", categories: CART_CATEGORIES },

  // Livrare — rulesetul SHIPPING se evalueaza o data per metoda, deci
  // regulile pot viza o metoda anume.
  { path: "shipping.methodId", label: "Metoda de livrare", type: "string", example: "curier-express", categories: ["SHIPPING"] },
  { path: "shipping.baseCostCents", label: "Costul de listă al metodei (bani)", type: "number", categories: ["SHIPPING"] },

  // Sesiune
  { path: "session.isGuest", label: "Este vizitator (fără cont)", type: "boolean" },
  { path: "session.isAuthenticated", label: "Este autentificat", type: "boolean" },

  // Timp
  { path: "now", label: "Momentul evaluării (dată)", type: "date" },
];

export function getFact(path: string): FactDef | undefined {
  return FACTS.find((f) => f.path === path);
}

/** Faptele care exista in contextul unei categorii de decizie. */
export function factsForCategory(category: DecisionCategory): FactDef[] {
  return FACTS.filter((f) => !f.categories || f.categories.includes(category));
}
