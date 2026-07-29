/**
 * Prioritatea regulilor, pe intelesul administratorilor: 4 niveluri denumite
 * in loc de un numar abstract. Motorul lucreaza in continuare cu numere —
 * nivelurile sunt doar o harta prietenoasa peste ele.
 */
export interface PriorityLevel {
  value: number;
  label: string;
  hint: string;
}

export const PRIORITY_LEVELS: PriorityLevel[] = [
  { value: 50, label: "Scăzută", hint: "se aplică doar dacă nu o bate altă regulă" },
  { value: 100, label: "Normală", hint: "potrivită pentru majoritatea regulilor" },
  { value: 500, label: "Ridicată", hint: "bate regulile normale" },
  { value: 1000, label: "Critică", hint: "bate aproape orice (ex: blocări, plafoane)" },
];

/** Eticheta nivelului cel mai apropiat de un numar arbitrar. */
export function priorityLabel(priority: number): string {
  let best = PRIORITY_LEVELS[0]!;
  for (const level of PRIORITY_LEVELS) {
    if (Math.abs(level.value - priority) < Math.abs(best.value - priority)) {
      best = level;
    }
  }
  return best.label.toLowerCase();
}

/** Valoarea de nivel cea mai apropiata (pentru preselectarea in editor). */
export function nearestPriorityValue(priority: number): number {
  let best = PRIORITY_LEVELS[0]!;
  for (const level of PRIORITY_LEVELS) {
    if (Math.abs(level.value - priority) < Math.abs(best.value - priority)) {
      best = level;
    }
  }
  return best.value;
}
