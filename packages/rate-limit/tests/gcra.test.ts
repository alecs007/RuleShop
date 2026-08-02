import { describe, expect, it } from "vitest";
import { gcra, gcraParams, ttlMs } from "../src/gcra";

/** 10 requests / 60s, full burst — the typical configuration. */
const params = gcraParams(10, 60_000);

describe("gcraParams", () => {
  it("traduce limita si perioada in interval de emisie", () => {
    expect(params.emissionIntervalMs).toBe(6_000);
    expect(params.toleranceMs).toBe(60_000);
  });

  it("burst = 1 forteaza trafic uniform", () => {
    const strict = gcraParams(10, 60_000, 1);
    expect(strict.toleranceMs).toBe(6_000);
  });

  it("refuza configuratii imposibile", () => {
    expect(() => gcraParams(0, 1000)).toThrow(RangeError);
    expect(() => gcraParams(10, 0)).toThrow(RangeError);
  });
});

describe("gcra", () => {
  it("lasa un client nou sa consume toata limita dintr-o data", () => {
    let tat: number | null = null;
    const now = 1_000_000;

    for (let i = 0; i < 10; i++) {
      const outcome = gcra(tat, now, params);
      expect(outcome.allowed).toBe(true);
      expect(outcome.remaining).toBe(9 - i);
      tat = outcome.tatMs;
    }

    expect(gcra(tat, now, params).allowed).toBe(false);
  });

  it("nu consuma bugetul cand refuza", () => {
    // A client that keeps retrying must not push its own window out.
    let tat: number | null = null;
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) tat = gcra(tat, now, params).tatMs;

    const first = gcra(tat, now, params);
    const second = gcra(first.tatMs, now, params);

    expect(first.allowed).toBe(false);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterMs).toBe(first.retryAfterMs);
  });

  it("reface bugetul treptat, cate unul la interval de emisie", () => {
    let tat: number | null = null;
    const start = 1_000_000;
    for (let i = 0; i < 10; i++) tat = gcra(tat, start, params).tatMs;

    expect(gcra(tat, start + 5_999, params).allowed).toBe(false);
    expect(gcra(tat, start + 6_000, params).allowed).toBe(true);
  });

  it("nu are granita de fereastra — o fereastra fixa ar lasa 2x limita", () => {
    // The case that breaks INCR+EXPIRE: the whole budget at the end of a
    // window, then again right after. Here the second burst is rejected.
    let tat: number | null = null;
    const endOfWindow = 60_000;
    for (let i = 0; i < 10; i++) tat = gcra(tat, endOfWindow, params).tatMs;

    let allowedInSecondBurst = 0;
    for (let i = 0; i < 10; i++) {
      const outcome = gcra(tat, endOfWindow + 1_000, params);
      if (outcome.allowed) allowedInSecondBurst++;
      tat = outcome.tatMs;
    }

    expect(allowedInSecondBurst).toBe(0);
  });

  it("spune cat trebuie asteptat", () => {
    let tat: number | null = null;
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) tat = gcra(tat, now, params).tatMs;

    expect(gcra(tat, now, params).retryAfterMs).toBe(6_000);
  });

  it("nu acumuleaza credit peste toleranta cand clientul sta linistit", () => {
    let tat: number | null = null;
    const start = 1_000_000;
    for (let i = 0; i < 10; i++) tat = gcra(tat, start, params).tatMs;

    // An idle hour grants no more than a full budget.
    let allowed = 0;
    let cursor: number | null = tat;
    for (let i = 0; i < 30; i++) {
      const outcome = gcra(cursor, start + 3_600_000, params);
      if (outcome.allowed) allowed++;
      cursor = outcome.tatMs;
    }

    expect(allowed).toBe(10);
  });

  it("respecta costul cererii", () => {
    const outcome = gcra(null, 1_000_000, params, 4);
    expect(outcome.allowed).toBe(true);
    expect(outcome.remaining).toBe(6);
  });

  it("refuza o cerere mai scumpa decat tot bugetul", () => {
    expect(gcra(null, 1_000_000, params, 11).allowed).toBe(false);
  });
});

describe("ttlMs", () => {
  it("tine cheia exact cat spune ceva", () => {
    expect(ttlMs(1_006_000, 1_000_000)).toBe(6_000);
  });

  it("nu intoarce niciodata 0 sau negativ", () => {
    expect(ttlMs(999_000, 1_000_000)).toBe(1);
  });
});
