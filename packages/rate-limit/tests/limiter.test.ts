import { describe, expect, it, vi } from "vitest";
import { MemoryStore, RateLimiter, rateLimitHeaders } from "../src/index";
import type { RateLimitPolicy, RateLimitStore } from "../src/types";

const policy: RateLimitPolicy = { limit: 3, windowSeconds: 60 };

/** Magazin care cedează mereu — pentru comportamentul la Redis căzut. */
function brokenStore(): RateLimitStore {
  return {
    name: "redis",
    consume: () => Promise.reject(new Error("ECONNREFUSED")),
    reset: () => Promise.reject(new Error("ECONNREFUSED")),
  };
}

describe("RateLimiter", () => {
  it("lasa sa treaca pana la limita, apoi refuza", async () => {
    const limiter = new RateLimiter();

    expect((await limiter.consume("a", policy)).allowed).toBe(true);
    expect((await limiter.consume("a", policy)).allowed).toBe(true);
    expect((await limiter.consume("a", policy)).allowed).toBe(true);

    const denied = await limiter.consume("a", policy);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tine bugete separate per cheie", async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i++) await limiter.consume("a", policy);

    expect((await limiter.consume("a", policy)).allowed).toBe(false);
    expect((await limiter.consume("b", policy)).allowed).toBe(true);
  });

  it("reset sterge bugetul cheii", async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i++) await limiter.consume("a", policy);
    expect((await limiter.consume("a", policy)).allowed).toBe(false);

    await limiter.reset("a");
    expect((await limiter.consume("a", policy)).allowed).toBe(true);
  });

  it("raporteaza limita si cat a mai ramas", async () => {
    const limiter = new RateLimiter();
    const result = await limiter.consume("a", policy);

    expect(result.limit).toBe(3);
    expect(result.remaining).toBe(2);
    expect(result.source).toBe("memory");
  });

  describe("cand magazinul principal cade", () => {
    it("implicit cade pe memorie — protectia slabeste, nu dispare", async () => {
      const onStoreError = vi.fn();
      const limiter = new RateLimiter({ store: brokenStore(), onStoreError });

      for (let i = 0; i < 3; i++) {
        expect((await limiter.consume("a", policy)).allowed).toBe(true);
      }
      const denied = await limiter.consume("a", policy);

      expect(denied.allowed).toBe(false);
      expect(denied.source).toBe("memory");
      expect(onStoreError).toHaveBeenCalled();
    });

    it("`allow` lasa cererile sa treaca", async () => {
      const limiter = new RateLimiter({ store: brokenStore() });
      const lenient = { ...policy, onStoreError: "allow" as const };

      for (let i = 0; i < 10; i++) {
        const result = await limiter.consume("a", lenient);
        expect(result.allowed).toBe(true);
        expect(result.source).toBe("store-error");
      }
    });

    it("`deny` refuza cererile", async () => {
      const limiter = new RateLimiter({ store: brokenStore() });
      const strict = { ...policy, onStoreError: "deny" as const };

      const result = await limiter.consume("a", strict);
      expect(result.allowed).toBe(false);
      expect(result.source).toBe("store-error");
    });

    it("reset nu arunca daca magazinul principal e cazut", async () => {
      const limiter = new RateLimiter({ store: brokenStore() });
      await expect(limiter.reset("a")).resolves.toBeUndefined();
    });
  });

  it("foloseste magazinul principal cand merge", async () => {
    const limiter = new RateLimiter({ store: new MemoryStore() });
    const result = await limiter.consume("a", policy);
    expect(result.source).toBe("memory");
  });

  it("prefixul separa cheile de restul datelor din Redis", async () => {
    const seen: string[] = [];
    const spy: RateLimitStore = {
      name: "redis",
      async consume(key) {
        seen.push(key);
        return { allowed: true, remaining: 1, retryAfterMs: 0, resetAfterMs: 0 };
      },
      async reset() {},
    };

    await new RateLimiter({ store: spy, prefix: "rl" }).consume("login:a@b.c", policy);
    expect(seen).toEqual(["rl:login:a@b.c"]);
  });
});

describe("rateLimitHeaders", () => {
  it("nu pune Retry-After cand cererea a trecut", async () => {
    const limiter = new RateLimiter();
    const headers = rateLimitHeaders(await limiter.consume("a", policy));

    expect(headers["X-RateLimit-Limit"]).toBe("3");
    expect(headers["X-RateLimit-Remaining"]).toBe("2");
    expect(headers).not.toHaveProperty("Retry-After");
  });

  it("pune Retry-After cand cererea a fost refuzata", async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i++) await limiter.consume("a", policy);
    const headers = rateLimitHeaders(await limiter.consume("a", policy));

    expect(Number(headers["Retry-After"])).toBeGreaterThanOrEqual(1);
  });
});
