export interface RateLimitPolicy {
  /** Câte cereri sunt permise într-o perioadă. */
  limit: number;
  /** Lungimea perioadei, în secunde. */
  windowSeconds: number;
  /**
   * Cât de mult se poate înghesui traficul. Implicit `limit` — un client odihnit
   * poate consuma toată limita dintr-o dată. Cu `burst: 1`, cererile sunt
   * forțate să fie perfect uniforme.
   */
  burst?: number;
  /**
   * Ce se întâmplă dacă magazinul de stare (Redis) nu răspunde.
   *
   *  - `fallback` (implicit) — se trece pe limitarea din memoria procesului.
   *    Protecția slăbește (nu mai e partajată între instanțe), dar nu dispare;
   *  - `allow` — cererea trece. Pentru limite care sunt igienă, nu securitate;
   *  - `deny` — cererea se refuză. Pentru operațiile în care e mai bine să
   *    refuzi decât să lași nelimitat.
   */
  onStoreError?: "fallback" | "allow" | "deny";
}

export interface RateLimitResult {
  allowed: boolean;
  /** Limita configurată — pentru antetul `X-RateLimit-Limit`. */
  limit: number;
  /** Câte cereri mai încap imediat. */
  remaining: number;
  /** Secunde până când cererea ar trece. 0 dacă a trecut. */
  retryAfterSeconds: number;
  /** Secunde până când bugetul redevine plin. */
  resetSeconds: number;
  /** Ce a decis efectiv: util în teste și la diagnosticarea unui Redis căzut. */
  source: "redis" | "memory" | "store-error";
}

/** Starea unei chei: doar `tat`-ul din GCRA. */
export interface RateLimitStore {
  readonly name: "redis" | "memory";
  /**
   * Aplică o cerere pe cheie și întoarce rezultatul. Trebuie să fie atomică —
   * altfel două cereri simultane citesc același `tat` și trec amândouă.
   */
  consume(
    key: string,
    nowMs: number,
    emissionIntervalMs: number,
    toleranceMs: number,
    cost: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number; resetAfterMs: number }>;
  /** Șterge starea unei chei (ex: după un login reușit). */
  reset(key: string): Promise<void>;
}
