import { createHash } from "crypto";
import type { RuleSetSnapshot } from "@ruleshop/rule-engine";

/**
 * Checksum of a snapshot's content: conflict strategy, default decision and
 * rules. The version number is deliberately excluded — it grows on every
 * publish, so including it would give two identical snapshots different
 * checksums and no-op publishes could never be detected.
 */
export function snapshotChecksum(snapshot: RuleSetSnapshot): string {
  const { version: _version, ...content } = snapshot;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
