/**
 * GCRA — Generic Cell Rate Algorithm. A token bucket without the tokens: the
 * whole state is one number, `tat` (theoretical arrival time), the moment the
 * next request would arrive under perfectly even traffic. Unlike a fixed
 * window, the budget refills continuously, so there is no boundary at which a
 * client can spend twice the limit in two seconds.
 *
 * Pure: no clock, no keys, no I/O — the stores feed it the state.
 */

export interface GcraParams {
  /** Ideal distance between two requests, in ms. */
  emissionIntervalMs: number;
  /** How far traffic may bunch up ahead of the ideal, in ms. */
  toleranceMs: number;
}

export interface GcraOutcome {
  allowed: boolean;
  /** The `tat` to store. Unchanged if the request was rejected. */
  tatMs: number;
  remaining: number;
  retryAfterMs: number;
  resetAfterMs: number;
}
export function gcraParams(limit: number, periodMs: number, burst = limit): GcraParams {
  if (limit <= 0) throw new RangeError("limit trebuie să fie > 0");
  if (periodMs <= 0) throw new RangeError("periodMs trebuie să fie > 0");
  const emissionIntervalMs = periodMs / limit;
  return {
    emissionIntervalMs,
    toleranceMs: emissionIntervalMs * Math.max(1, burst),
  };
}

/** Decides whether a request passes. A missing `tatMs` means a full budget. */
export function gcra(
  tatMs: number | null,
  nowMs: number,
  params: GcraParams,
  cost = 1,
): GcraOutcome {
  const { emissionIntervalMs, toleranceMs } = params;

  // Idle clients bank no credit beyond `tolerance`: `tat` never drops below now.
  const tat = Math.max(tatMs ?? nowMs, nowMs);
  const increment = emissionIntervalMs * cost;
  const newTat = tat + increment;
  const allowAtMs = newTat - toleranceMs;

  if (allowAtMs > nowMs) {
    // Rejected requests do not consume budget, or a client that keeps retrying
    // would push its own window out forever.
    return {
      allowed: false,
      tatMs: tat,
      remaining: budgetLeft(tat, nowMs, params),
      retryAfterMs: Math.ceil(allowAtMs - nowMs),
      resetAfterMs: Math.ceil(Math.max(0, tat - nowMs)),
    };
  }

  return {
    allowed: true,
    tatMs: newTat,
    remaining: budgetLeft(newTat, nowMs, params),
    retryAfterMs: 0,
    resetAfterMs: Math.ceil(Math.max(0, newTat - nowMs)),
  };
}

function budgetLeft(tatMs: number, nowMs: number, params: GcraParams): number {
  const spare = params.toleranceMs - (tatMs - nowMs);
  return Math.max(0, Math.floor(spare / params.emissionIntervalMs));
}

/** How long the key is worth keeping: past `tat` the state says nothing. */
export function ttlMs(tatMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil(tatMs - nowMs));
}
