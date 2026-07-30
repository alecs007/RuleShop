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

/** Ce inseamna statusul pentru CLIENT, in cuvintele lui. */
export const ORDER_STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  PENDING: "Comanda e înregistrată și se pregătește.",
  AWAITING_REVIEW:
    "Comanda trece printr-o verificare de siguranță. Nu s-a încasat nicio plată până atunci.",
  PAID: "Plata a fost înregistrată. Comanda se pregătește pentru livrare.",
  FULFILLED: "Comanda a fost livrată. Îți mulțumim!",
  CANCELLED: "Comanda a fost anulată. Produsele au revenit în stoc.",
  REJECTED: "În urma verificării, comanda nu a putut fi procesată.",
  REFUNDED: "Comanda a fost rambursată.",
};

/** Pasul unei comenzi in cronologia afisata clientului. */
export interface TimelineStep {
  label: string;
  state: "done" | "current" | "upcoming" | "failed";
}

/**
 * Cronologia comenzii, pe intelesul clientului. Traseul normal este
 * Plasată → Confirmată → Livrată; verificarea antifraudă se insereaza cand
 * exista, iar statusurile terminale (anulata, respinsa) inchid traseul in loc
 * sa-l continue — clientul vede unde s-a oprit, nu pasi care nu vor mai veni.
 */
export function orderTimeline(status: OrderStatus): TimelineStep[] {
  const placed: TimelineStep = { label: "Plasată", state: "done" };

  switch (status) {
    case "PENDING":
      return [
        { label: "Plasată", state: "current" },
        { label: "Confirmată", state: "upcoming" },
        { label: "Livrată", state: "upcoming" },
      ];
    case "AWAITING_REVIEW":
      return [
        placed,
        { label: "În verificare", state: "current" },
        { label: "Confirmată", state: "upcoming" },
        { label: "Livrată", state: "upcoming" },
      ];
    case "PAID":
      return [
        placed,
        { label: "Confirmată", state: "current" },
        { label: "Livrată", state: "upcoming" },
      ];
    case "FULFILLED":
      return [
        placed,
        { label: "Confirmată", state: "done" },
        { label: "Livrată", state: "done" },
      ];
    case "CANCELLED":
      return [placed, { label: "Anulată", state: "failed" }];
    case "REJECTED":
      return [placed, { label: "Respinsă", state: "failed" }];
    case "REFUNDED":
      return [
        placed,
        { label: "Confirmată", state: "done" },
        { label: "Rambursată", state: "current" },
      ];
  }
}

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
