/**
 * Repartizarea canary determinista.
 *
 * Acelasi utilizator (sau aceeasi sesiune guest) trebuie sa cada mereu pe
 * aceeasi ramura (stable/canary) pentru acelasi ruleset — cerinta explicita
 * din barem. Folosim FNV-1a (implementat local, fara dependinte) peste
 * `storeId:rulesetKey:subjectKey`, proiectat uniform in [0, 100).
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Hash FNV-1a pe 32 de biti, determinist si rapid. */
export function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

export interface CanaryAssignmentInput {
  storeId: string;
  rulesetKey: string;
  /** userId pentru clienti autentificati, sessionKey pentru guest. */
  subjectKey: string;
  /** Procentul de trafic directionat spre canary, 0-100. */
  canaryPercentage: number;
}

/**
 * Bucket-ul stabil al subiectului in [0, 100).
 * Expus separat pentru afisarea in control plane ("acest user cade in 37.42").
 */
export function canaryBucket(input: Omit<CanaryAssignmentInput, "canaryPercentage">): number {
  const hash = fnv1a(`${input.storeId}:${input.rulesetKey}:${input.subjectKey}`);
  // doua zecimale de precizie: 0.00 - 99.99
  return (hash % 10000) / 100;
}

/** true daca subiectul cade pe ramura canary. */
export function isInCanaryCohort(input: CanaryAssignmentInput): boolean {
  const pct = Math.min(100, Math.max(0, input.canaryPercentage));
  if (pct === 0) return false;
  if (pct === 100) return true;
  return canaryBucket(input) < pct;
}
