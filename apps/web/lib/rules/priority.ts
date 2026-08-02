/**
 * Four named levels instead of an abstract number. The engine still works in
 * numbers; the levels are only a friendlier map over them.
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

/** The label of the level nearest an arbitrary number. */
export function priorityLabel(priority: number): string {
  let best = PRIORITY_LEVELS[0]!;
  for (const level of PRIORITY_LEVELS) {
    if (Math.abs(level.value - priority) < Math.abs(best.value - priority)) {
      best = level;
    }
  }
  return best.label.toLowerCase();
}

/** The nearest level value, for preselecting in the editor. */
export function nearestPriorityValue(priority: number): number {
  let best = PRIORITY_LEVELS[0]!;
  for (const level of PRIORITY_LEVELS) {
    if (Math.abs(level.value - priority) < Math.abs(best.value - priority)) {
      best = level;
    }
  }
  return best.value;
}
