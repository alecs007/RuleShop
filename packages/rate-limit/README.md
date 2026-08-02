# 🚦 @ruleshop/rate-limit

Rate limiting with GCRA (Generic Cell Rate Algorithm): atomic, in a single call
to Redis, degrading to process memory when Redis is unavailable.

```ts
import { RateLimiter, RedisStore, rateLimitHeaders } from "@ruleshop/rate-limit";

const limiter = new RateLimiter({ store: new RedisStore(redis) });

const gate = await limiter.consume(`login:${email}`, {
  limit: 10,
  windowSeconds: 600,
  burst: 3,
  onStoreError: "deny",
});

if (!gate.allowed) {
  return new Response("Too many attempts", {
    status: 429,
    headers: rateLimitHeaders(gate),
  });
}
```

## ⚙️ Policies

| Field           | Default    | Role                                                             |
| --------------- | ---------- | ---------------------------------------------------------------- |
| `limit`         | —          | How many requests are allowed within a period                    |
| `windowSeconds` | —          | The length of the period                                         |
| `burst`         | `limit`    | How much traffic may bunch up. `1` enforces an even pace         |
| `onStoreError`  | `fallback` | The behaviour when the state store does not respond              |

`onStoreError` accepts `fallback` (limiting from process memory), `allow`
(the request goes through) and `deny` (the request is rejected). `fallback` is
the difference from a *fail-open* limiter: the protection is no longer shared
between instances, but it does not vanish the moment Redis becomes unavailable.

## 📤 Result

`consume()` returns `allowed`, `limit`, `remaining`, `retryAfterSeconds`,
`resetSeconds` and `source` (`redis`, `memory` or `store-error`).
`rateLimitHeaders()` turns them into `X-RateLimit-*` and `Retry-After`.

`reset(key)` clears a key's budget — used after a successful sign-in, so that the
failed attempts before it do not carry over into the next session.

## 🔍 The algorithm

A key's state is a single number, `tat` (theoretical arrival time), the moment at
which the next request should arrive under perfectly even traffic. The budget
refills continuously, not at window boundaries, and rejected requests do not
consume it. The computation runs inside a Lua script, so it is atomic and takes a
single call, using the Redis server's clock (`TIME`), so the clocks of the web
instances do not need to be synchronised.

Compared to a fixed window on `INCR` + `EXPIRE`, this eliminates the burst at the
window boundary (double the limit within two consecutive seconds), the race
between `INCR` and `EXPIRE` that can leave a key without an expiry, and the
counting of already-rejected requests.

## 📦 Structure

| File              | Role                                                           |
| ----------------- | -------------------------------------------------------------- |
| `gcra.ts`         | The algorithm, a pure function — no clock, keys or I/O          |
| `memory-store.ts` | In-process state: without Redis, in tests and as a fallback     |
| `redis-store.ts`  | The Lua script and `defineCommand`                              |
| `limiter.ts`      | Store selection, the error policy, the headers                  |

```bash
pnpm --filter @ruleshop/rate-limit test
```
