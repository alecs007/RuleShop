import { createHash } from "crypto";
import type { RuleSetSnapshot } from "@/lib/engine";

/**
 * Checksumul CONȚINUTULUI unui snapshot: strategie de conflict, decizie
 * implicită și reguli.
 *
 * Numărul de versiune este exclus intenționat. El crește la fiecare publicare,
 * deci dacă ar intra în hash două versiuni cu conținut identic ar avea mereu
 * checksumuri diferite — și detectarea publicărilor fără modificări nu ar
 * funcționa niciodată.
 *
 * Modul pur (fără DB, fără `server-only`): îl folosesc atât serviciul de
 * publicare, cât și seed-ul, ca să nu existe două formule care pot să divergă.
 */
export function snapshotChecksum(snapshot: RuleSetSnapshot): string {
  const { version: _version, ...content } = snapshot;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
