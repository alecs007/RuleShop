/**
 * GCRA — Generic Cell Rate Algorithm.
 *
 * Echivalent cu un token bucket, dar fără să țină efectiv jetoane: toată starea
 * este un singur număr, `tat` (theoretical arrival time) — momentul la care ar
 * fi "corect" să sosească următoarea cerere dacă traficul ar fi perfect uniform.
 *
 * De ce nu o fereastră fixă: cu `INCR`+`EXPIRE` pe ferestre de un minut, un
 * client poate trimite tot bugetul în ultima secundă a unei ferestre și încă o
 * dată în prima secundă a următoarei — dublul limitei, în două secunde. GCRA nu
 * are graniță de fereastră: bugetul se reface continuu, cu
 * `emissionInterval` la fiecare cerere.
 *
 * Doi parametri:
 *  - `emissionIntervalMs` — distanța ideală între două cereri (perioadă/limită);
 *  - `toleranceMs` — cât are voie traficul să se înghesuie față de ideal.
 *    Cu `toleranceMs = emissionInterval * limită`, un client care a stat liniștit
 *    poate consuma toată limita dintr-o dată, apoi se reface treptat.
 *
 * Funcția este pură — nu știe de Redis, de ceas sau de chei. Asta o face
 * testabilă exact, iar magazinele (memorie/Redis) doar o alimentează cu starea.
 */

export interface GcraParams {
  /** Distanța ideală între două cereri, în milisecunde. */
  emissionIntervalMs: number;
  /** Cât are voie traficul să se înghesuie față de ideal, în milisecunde. */
  toleranceMs: number;
}

export interface GcraOutcome {
  allowed: boolean;
  /** `tat`-ul care trebuie salvat. Egal cu cel vechi dacă cererea a fost refuzată. */
  tatMs: number;
  /** Câte cereri mai încap imediat după aceasta. */
  remaining: number;
  /** Cât trebuie așteptat până cererea ar trece. 0 dacă a trecut. */
  retryAfterMs: number;
  /** Când bugetul redevine plin (util pentru antetul `X-RateLimit-Reset`). */
  resetAfterMs: number;
}

/** Perioada și limita, traduse în parametrii GCRA. */
export function gcraParams(limit: number, periodMs: number, burst = limit): GcraParams {
  if (limit <= 0) throw new RangeError("limit trebuie să fie > 0");
  if (periodMs <= 0) throw new RangeError("periodMs trebuie să fie > 0");
  const emissionIntervalMs = periodMs / limit;
  return {
    emissionIntervalMs,
    toleranceMs: emissionIntervalMs * Math.max(1, burst),
  };
}

/**
 * Decide dacă o cerere trece, pornind de la `tat`-ul stocat.
 *
 * `tatMs` lipsă (cheie nouă) înseamnă un client fără istoric — pornim de la
 * `now`, deci are bugetul plin.
 */
export function gcra(
  tatMs: number | null,
  nowMs: number,
  params: GcraParams,
  cost = 1,
): GcraOutcome {
  const { emissionIntervalMs, toleranceMs } = params;

  // Un client care a stat liniștit nu acumulează credit peste `tolerance`:
  // `tat` nu coboară niciodată sub momentul curent.
  const tat = Math.max(tatMs ?? nowMs, nowMs);
  const increment = emissionIntervalMs * cost;
  const newTat = tat + increment;

  // Momentul din care cererea ar fi acceptabilă.
  const allowAtMs = newTat - toleranceMs;

  if (allowAtMs > nowMs) {
    // Refuzată — bugetul NU se consumă, altfel un client care insistă și-ar
    // împinge singur fereastra la infinit.
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

/** Câte cereri mai încap în toleranță la momentul `nowMs`. */
function budgetLeft(tatMs: number, nowMs: number, params: GcraParams): number {
  const spare = params.toleranceMs - (tatMs - nowMs);
  return Math.max(0, Math.floor(spare / params.emissionIntervalMs));
}

/**
 * Cât timp trebuie păstrată cheia. Dincolo de `tat` starea nu mai spune nimic:
 * un client fără `tat` are oricum bugetul plin, deci cheia poate expira.
 */
export function ttlMs(tatMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil(tatMs - nowMs));
}
