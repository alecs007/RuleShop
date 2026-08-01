import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@prisma/client";
import {
  allowedTransitions,
  ORDER_STATUS_DESCRIPTIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  orderTimeline,
} from "@/lib/shop/order-status";

const ALL_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

describe("etichetele si descrierile statusurilor", () => {
  it("fiecare status are etichetă, ton si explicatie pentru client", () => {
    for (const status of ALL_STATUSES) {
      expect(ORDER_STATUS_LABELS[status]).toBeTruthy();
      expect(ORDER_STATUS_TONES[status]).toBeTruthy();
      // Fara descriere, o comanda anulata sau rambursata ar rămâne neexplicata.
      expect(ORDER_STATUS_DESCRIPTIONS[status]).toBeTruthy();
    }
  });
});

describe("orderTimeline", () => {
  it("fiecare status produce o cronologie nevida", () => {
    for (const status of ALL_STATUSES) {
      expect(orderTimeline(status).length).toBeGreaterThan(0);
    }
  });

  it("comanda noua e la primul pas, restul urmeaza", () => {
    const steps = orderTimeline("PENDING");
    expect(steps.map((s) => s.state)).toEqual([
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("verificarea antifraudă apare ca pas propriu", () => {
    const steps = orderTimeline("AWAITING_REVIEW");
    expect(steps.map((s) => s.label)).toContain("În verificare");
    expect(steps.find((s) => s.label === "În verificare")?.state).toBe("current");
  });

  it("comanda livrata are toti pasii parcursi", () => {
    expect(orderTimeline("FULFILLED").every((s) => s.state === "done")).toBe(true);
  });

  it("statusurile terminale inchid traseul, fara pasi viitori", () => {
    for (const status of ["CANCELLED", "REJECTED"] as const) {
      const steps = orderTimeline(status);
      expect(steps.at(-1)?.state).toBe("failed");
      // Nimic „upcoming": pasii care nu vor mai veni nu se promit clientului.
      expect(steps.some((s) => s.state === "upcoming")).toBe(false);
    }
  });

  it("rambursarea pastreaza istoricul plății", () => {
    const steps = orderTimeline("REFUNDED");
    expect(steps.map((s) => s.label)).toEqual([
      "Plasată",
      "Confirmată",
      "Rambursată",
    ]);
  });
});

describe("allowedTransitions", () => {
  it("comanda in aşteptare poate fi incasata sau anulata", () => {
    expect(allowedTransitions("PENDING")).toEqual(["PAID", "CANCELLED"]);
  });

  it("comanda incasata poate fi livrata sau anulata", () => {
    expect(allowedTransitions("PAID")).toEqual(["FULFILLED", "CANCELLED"]);
  });

  it("comanda livrata poate fi doar rambursata", () => {
    expect(allowedTransitions("FULFILLED")).toEqual(["REFUNDED"]);
  });

  it("statusurile terminale nu mai au tranzitii", () => {
    for (const status of ["CANCELLED", "REJECTED", "REFUNDED"] as const) {
      expect(allowedTransitions(status)).toEqual([]);
    }
  });

  it("comanda in verificare antifraudă NU se decide din pagina de comenzi", () => {
    // Decizia are nevoie de contextul incidentului — se ia din /admin/fraud.
    expect(allowedTransitions("AWAITING_REVIEW")).toEqual([]);
  });

  it("nicio tranzitie nu duce intr-un status inexistent", () => {
    for (const status of ALL_STATUSES) {
      for (const next of allowedTransitions(status)) {
        expect(ALL_STATUSES).toContain(next);
      }
    }
  });
});
