/**
 * Deterministic canary assignment: the same subject must always land on the
 * same branch for a given ruleset, so the bucket comes from a hash of
 * `storeId:rulesetKey:subjectKey` rather than from chance.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

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
  /** userId for signed-in customers, sessionKey for guests. */
  subjectKey: string;
  canaryPercentage: number;
}

/** The subject's stable bucket in [0, 100), also shown in the control plane. */
export function canaryBucket(input: Omit<CanaryAssignmentInput, "canaryPercentage">): number {
  const hash = fnv1a(`${input.storeId}:${input.rulesetKey}:${input.subjectKey}`);
  return (hash % 10000) / 100;
}

export function isInCanaryCohort(input: CanaryAssignmentInput): boolean {
  const pct = Math.min(100, Math.max(0, input.canaryPercentage));
  if (pct === 0) return false;
  if (pct === 100) return true;
  return canaryBucket(input) < pct;
}
