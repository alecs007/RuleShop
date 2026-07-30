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
