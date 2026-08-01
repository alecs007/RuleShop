import type { RateLimitStore } from "./types";

/**
 * Clientul Redis, redus la ce folosim. Tipat structural ca să nu impunem
 * `ioredis` ca dependință a pachetului — orice client cu `defineCommand` merge.
 *
 * Comanda definită la runtime prin `defineCommand` nu există în tipul
 * clientului, deci se citește printr-un acces indexat explicit (`asRecord`) în
 * loc de o semnătură de index pe interfață — aceea ar fi respinsă de `Redis`,
 * care nu declară una.
 */
export interface RedisLike {
  defineCommand(
    name: string,
    definition: { numberOfKeys: number; lua: string },
  ): void;
  del(key: string): Promise<unknown>;
}

function asRecord(client: RedisLike): Record<string, unknown> {
  return client as unknown as Record<string, unknown>;
}

/**
 * GCRA într-un singur script Lua — deci într-un singur drum dus-întors și
 * atomic.
 *
 * Varianta cu `INCR` + `EXPIRE` + `TTL` are două defecte pe care asta le
 * închide: sunt trei comenzi (deci trei drumuri, iar între `INCR` și `EXPIRE`
 * procesul poate muri și cheia rămâne fără termen de expirare, blocând clientul
 * pentru totdeauna), și nu sunt atomice, deci două cereri simultane pot citi
 * aceeași stare.
 *
 * Ceasul e cel al serverului Redis (`TIME`), nu al aplicației: cu mai multe
 * instanțe web, ceasurile lor nu trebuie să fie de acord între ele.
 */
const GCRA_LUA = `
local emission  = tonumber(ARGV[1])
local tolerance = tonumber(ARGV[2])
local cost      = tonumber(ARGV[3])

local t   = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)

local stored = redis.call('GET', KEYS[1])
local tat = now
if stored then
  local parsed = tonumber(stored)
  if parsed and parsed > now then tat = parsed end
end

local newTat  = tat + emission * cost
local allowAt = newTat - tolerance

local allowed, finalTat
if allowAt > now then
  -- Refuzată: bugetul NU se consumă, altfel un client care insistă și-ar
  -- împinge singur fereastra tot mai departe.
  allowed  = 0
  finalTat = tat
else
  allowed  = 1
  finalTat = newTat
  local pttl = math.ceil(newTat - now)
  if pttl < 1 then pttl = 1 end
  redis.call('SET', KEYS[1], string.format('%.0f', newTat), 'PX', pttl)
end

local remaining = math.floor((tolerance - (finalTat - now)) / emission)
if remaining < 0 then remaining = 0 end

local retry = 0
if allowed == 0 then retry = math.ceil(allowAt - now) end

local reset = math.ceil(finalTat - now)
if reset < 0 then reset = 0 end

return { allowed, remaining, retry, reset }
`;

const COMMAND = "ruleshopGcra";

export class RedisStore implements RateLimitStore {
  readonly name = "redis" as const;

  constructor(private readonly redis: RedisLike) {
    // `defineCommand` trimite EVALSHA și retrimite scriptul singur dacă Redis a
    // fost repornit și nu îl mai are în cache.
    this.redis.defineCommand(COMMAND, { numberOfKeys: 1, lua: GCRA_LUA });
  }

  async consume(
    key: string,
    _nowMs: number,
    emissionIntervalMs: number,
    toleranceMs: number,
    cost: number,
  ) {
    // Apelat ca metodă, nu ca funcție extrasă: comanda generată de ioredis are
    // nevoie de `this` — clientul.
    const run = asRecord(this.redis)[COMMAND] as (
      this: RedisLike,
      key: string,
      emission: string,
      tolerance: string,
      cost: string,
    ) => Promise<[number, number, number, number]>;

    const [allowed, remaining, retryAfterMs, resetAfterMs] = await run.call(
      this.redis,
      key,
      String(emissionIntervalMs),
      String(toleranceMs),
      String(cost),
    );

    return {
      allowed: allowed === 1,
      remaining,
      retryAfterMs,
      resetAfterMs,
    };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
