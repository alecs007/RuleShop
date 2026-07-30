import type { OrderStatus } from "@prisma/client";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "În așteptare",
  AWAITING_REVIEW: "În verificare",
  PAID: "Confirmată",
  FULFILLED: "Livrată",
  CANCELLED: "Anulată",
  REJECTED: "Respinsă",
  REFUNDED: "Rambursată",
};

/**
 * Tranzitiile de status permise operatorului din /admin/orders. Comenzile in
 * verificare antifrauda (AWAITING_REVIEW) se decid EXCLUSIV din /admin/fraud,
 * unde operatorul vede si incidentul — aici nu au nicio tranzitie.
 */
const ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["FULFILLED", "CANCELLED"],
  FULFILLED: ["REFUNDED"],
};

export function allowedTransitions(status: OrderStatus): OrderStatus[] {
  return ALLOWED_TRANSITIONS[status] ?? [];
}

/** Eticheta butonului pentru o tranzitie („marchează ca …"). */
export const TRANSITION_LABELS: Partial<Record<OrderStatus, string>> = {
  PAID: "Marchează plătită",
  FULFILLED: "Marchează livrată",
  CANCELLED: "Anulează comanda",
  REFUNDED: "Marchează rambursată",
};

export const ORDER_STATUS_TONES: Record<
  OrderStatus,
  "neutral" | "accent" | "positive" | "caution" | "critical"
> = {
  PENDING: "caution",
  AWAITING_REVIEW: "caution",
  PAID: "positive",
  FULFILLED: "positive",
  CANCELLED: "neutral",
  REJECTED: "critical",
  REFUNDED: "neutral",
};
