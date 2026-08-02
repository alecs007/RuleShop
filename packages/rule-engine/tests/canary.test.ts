import { describe, expect, it } from "vitest";
import { canaryBucket, isInCanaryCohort } from "../src/canary";

const base = { storeId: "store-1", rulesetKey: "pricing" };

describe("repartizarea canary", () => {
  it("este determinista: acelasi subiect => acelasi bucket, mereu", () => {
    const a = canaryBucket({ ...base, subjectKey: "user-42" });
    for (let i = 0; i < 100; i++) {
      expect(canaryBucket({ ...base, subjectKey: "user-42" })).toBe(a);
    }
  });

  it("acelasi subiect ramane pe aceeasi ramura la acelasi procent", () => {
    const input = { ...base, subjectKey: "sess-abc", canaryPercentage: 30 };
    const first = isInCanaryCohort(input);
    for (let i = 0; i < 50; i++) {
      expect(isInCanaryCohort(input)).toBe(first);
    }
  });

  it("0% => nimeni, 100% => toata lumea", () => {
    for (const key of ["a", "b", "c", "d"]) {
      expect(isInCanaryCohort({ ...base, subjectKey: key, canaryPercentage: 0 })).toBe(false);
      expect(isInCanaryCohort({ ...base, subjectKey: key, canaryPercentage: 100 })).toBe(true);
    }
  });

  it("procentele invalide sunt limitate la [0, 100]", () => {
    expect(isInCanaryCohort({ ...base, subjectKey: "x", canaryPercentage: -5 })).toBe(false);
    expect(isInCanaryCohort({ ...base, subjectKey: "x", canaryPercentage: 250 })).toBe(true);
  });

  it("distributia este aproximativ uniforma", () => {
    const total = 10000;
    let inCohort = 0;
    for (let i = 0; i < total; i++) {
      if (isInCanaryCohort({ ...base, subjectKey: `user-${i}`, canaryPercentage: 20 })) {
        inCohort++;
      }
    }
    const ratio = inCohort / total;
    // 20% +/- 2 percentage points
    expect(ratio).toBeGreaterThan(0.18);
    expect(ratio).toBeLessThan(0.22);
  });

  it("subiecti diferiti pot cadea pe ramuri diferite", () => {
    const buckets = new Set(
      Array.from({ length: 50 }, (_, i) =>
        canaryBucket({ ...base, subjectKey: `user-${i}` }),
      ),
    );
    expect(buckets.size).toBeGreaterThan(10);
  });

  it("bucket-ul depinde de ruleset — cohorte independente per categorie", () => {
    const pricing = canaryBucket({ storeId: "s", rulesetKey: "pricing", subjectKey: "u1" });
    const shipping = canaryBucket({ storeId: "s", rulesetKey: "shipping", subjectKey: "u1" });
    expect(pricing).not.toBe(shipping);
  });
});
