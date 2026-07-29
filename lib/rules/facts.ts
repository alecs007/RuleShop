/**
 * Catalogul de fapte disponibile in editorul de reguli.
 * Tipul fiecarui fact filtreaza operatorii oferiti (compatibilitate ceruta
 * de barem). Lista e informativa pentru editor — motorul accepta orice cale,
 * deci faptele noi adaugate in context functioneaza fara modificari aici.
 */
import type { FactType } from "@/lib/engine";

export interface FactDef {
  path: string;
  label: string;
  type: FactType;
  example?: string;
}

export const FACTS: FactDef[] = [
  // Produs (contextul evaluarilor de PRICING / AVAILABILITY per produs)
  { path: "product.basePriceCents", label: "Preț de bază (bani)", type: "number", example: "34900" },
  { path: "product.category", label: "Categoria produsului", type: "string", example: "audio" },
  { path: "product.brand", label: "Brandul produsului", type: "string" },
  { path: "product.sku", label: "SKU", type: "string" },
  { path: "product.stock", label: "Stoc disponibil", type: "number" },
  { path: "product.tags", label: "Etichetele produsului", type: "array", example: "wireless, promo" },

  // Client
  { path: "customer.loyaltyTier", label: "Nivel de loialitate", type: "string", example: "VIP" },
  { path: "customer.loyaltyPoints", label: "Puncte de loialitate", type: "number" },
  { path: "customer.completedOrders", label: "Comenzi finalizate", type: "number" },
  { path: "customer.lifetimeSpend", label: "Total cheltuit (bani)", type: "number" },
  { path: "customer.country", label: "Țara clientului", type: "string", example: "RO" },
  { path: "customer.email", label: "Email client", type: "string" },

  // Cos (contextul evaluarilor de SHIPPING / FRAUD / LOYALTY la checkout)
  { path: "cart.subtotalCents", label: "Subtotal coș (bani)", type: "number" },
  { path: "cart.itemCount", label: "Număr de produse în coș", type: "number" },
  { path: "cart.categories", label: "Categoriile din coș", type: "array" },

  // Sesiune
  { path: "session.isGuest", label: "Este vizitator (fără cont)", type: "boolean" },
  { path: "session.isAuthenticated", label: "Este autentificat", type: "boolean" },

  // Timp
  { path: "now", label: "Momentul evaluării (dată)", type: "date" },
];

export function getFact(path: string): FactDef | undefined {
  return FACTS.find((f) => f.path === path);
}
