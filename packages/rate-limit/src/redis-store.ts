import type { RateLimitStore } from "./types";

/**
 * The Redis client reduced to what we use, typed structurally so the package
 * does not depend on `ioredis`.
 */
export interface RedisLike {
  defineCommand(
    name: string,
    definition: { numberOfKeys: number; lua: string },
  ): void;
  del(key: string): Promise<unknown>;
}

/** `defineCommand` adds the command at runtime, so it is not on the type. */
function asRecord(client: RedisLike): Record<string, unknown> {
  return client as unknown as Record<string, unknown>;
}

/**
 * GCRA in one Lua script: atomic, one round trip, and on the Redis server's
 * clock (`TIME`), so the web instances' clocks need not agree.
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
  -- Rejected requests do not consume budget.
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
    // Sends EVALSHA and resends the script itself if Redis lost its cache.
    this.redis.defineCommand(COMMAND, { numberOfKeys: 1, lua: GCRA_LUA });
  }

  async consume(
    key: string,
    _nowMs: number,
    emissionIntervalMs: number,
    toleranceMs: number,
    cost: number,
  ) {
    // Called as a method: the ioredis-generated command needs `this`.
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
