# 🚦 @ruleshop/rate-limit

Limitare de rată cu GCRA (Generic Cell Rate Algorithm): atomică, într-un singur
apel către Redis, cu degradare în memoria procesului la indisponibilitatea
acestuia.

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
  return new Response("Prea multe încercări", {
    status: 429,
    headers: rateLimitHeaders(gate),
  });
}
```

## ⚙️ Politici

| Câmp            | Implicit   | Rol                                                              |
| --------------- | ---------- | ---------------------------------------------------------------- |
| `limit`         | —          | Câte cereri sunt permise într-o perioadă                          |
| `windowSeconds` | —          | Lungimea perioadei                                                |
| `burst`         | `limit`    | Cât are voie traficul să se înghesuie. `1` impune ritm uniform    |
| `onStoreError`  | `fallback` | Comportamentul când magazinul de stare nu răspunde                |

`onStoreError` acceptă `fallback` (limitare din memoria procesului), `allow`
(cererea trece) și `deny` (cererea se refuză). `fallback` este diferența față de
un limitator *fail-open*: protecția nu mai este partajată între instanțe, dar nu
dispare în momentul în care Redis devine indisponibil.

## 📤 Rezultat

`consume()` întoarce `allowed`, `limit`, `remaining`, `retryAfterSeconds`,
`resetSeconds` și `source` (`redis`, `memory` sau `store-error`).
`rateLimitHeaders()` le transformă în `X-RateLimit-*` și `Retry-After`.

`reset(key)` șterge bugetul unei chei — folosit după o autentificare reușită,
astfel încât încercările greșite dinaintea ei să nu se adune peste sesiunea
următoare.

## 🔍 Algoritmul

Starea unei chei este un singur număr, `tat` (theoretical arrival time), momentul
la care ar trebui să sosească următoarea cerere într-un trafic perfect uniform.
Bugetul se reface continuu, nu la granițe de fereastră, iar cererile refuzate nu
îl consumă. Calculul se execută într-un script Lua, deci atomic și într-un singur
apel, folosind ceasul serverului Redis (`TIME`), astfel încât ceasurile
instanțelor web nu trebuie sincronizate.

Față de o fereastră fixă pe `INCR` + `EXPIRE`, aceasta elimină rafala de la
granița ferestrei (limita dublă în două secunde consecutive), condiția de cursă
dintre `INCR` și `EXPIRE` care poate lăsa o cheie fără termen de expirare, și
contorizarea cererilor deja respinse.

## 📦 Structură

| Fișier            | Rol                                                            |
| ----------------- | -------------------------------------------------------------- |
| `gcra.ts`         | Algoritmul, funcție pură — fără ceas, chei sau I/O             |
| `memory-store.ts` | Stare în proces: fără Redis, în teste și ca rezervă            |
| `redis-store.ts`  | Scriptul Lua și `defineCommand`                                |
| `limiter.ts`      | Selecția magazinului, politica la eroare, antetele              |

```bash
pnpm --filter @ruleshop/rate-limit test
```
