/**
 * Serializarea cataloagelor motorului (fapte, operatori, actiuni) pentru
 * prompturile IA. Modelul primeste EXACT vocabularul pe care il intelege
 * motorul — orice iesire in afara lui pica la validare.
 */
import { OPERATORS, actionsForCategory, type DecisionCategory } from "@/lib/engine";
import { factsForCategory } from "@/lib/rules/facts";
import { PRIORITY_LEVELS } from "@/lib/rules/priority";

/** Formatul JSON al unei reguli, descris o singura data pentru toate prompturile. */
export const RULE_FORMAT_SPEC = `Formatul JSON al unei reguli (EngineRule):
{
  "key": "kebab-case, unic (ex: vip-discount)",
  "name": "nume scurt, in romana, pentru administratori",
  "priority": 50 | 100 | 500 | 1000,
  "enabled": true,
  "conditions": <nod-conditie>,
  "actions": [{ "type": "<TIP_ACTIUNE>", "params": { ... } }]
}
<nod-conditie> este fie o frunza:
  { "type": "condition", "fact": "<cale.fact>", "operator": "<id-operator>", "value": <valoare> }
(operatorii unari nu primesc "value"), fie un grup logic:
  { "type": "group", "op": "AND" | "OR" | "NOT", "children": [<nod-conditie>, ...] }
(NOT are exact un copil).`;

export function describeCatalog(category: DecisionCategory): string {
  const facts = factsForCategory(category)
    .map((f) => {
      const example = f.example ? ` (ex: ${f.example})` : "";
      return `- ${f.path} [${f.type}] — ${f.label}${example}`;
    })
    .join("\n");

  const operators = [...OPERATORS.values()]
    .map(
      (op) =>
        `- ${op.id} — ${op.label}; tipuri: ${op.factTypes.join(", ")}${op.unary ? "; UNAR (fără value)" : ""}`,
    )
    .join("\n");

  const actions = actionsForCategory(category)
    .map((action) => {
      const params = action.params
        .map((p) => {
          const bounds = [
            p.min !== undefined ? `min ${p.min}` : null,
            p.max !== undefined ? `max ${p.max}` : null,
            p.oneOf ? `una din: ${p.oneOf.join("|")}` : null,
            p.maxLength !== undefined ? `max ${p.maxLength} caractere` : null,
            p.pattern ? `format impus: ${p.pattern}` : null,
          ]
            .filter(Boolean)
            .join(", ");
          return `${p.name}: ${p.type}${p.required ? "" : "?"}${bounds ? ` (${bounds})` : ""}`;
        })
        .join("; ");
      return `- ${action.type} — ${action.label}${params ? ` | parametri: ${params}` : " | fără parametri"}`;
    })
    .join("\n");

  const priorities = PRIORITY_LEVELS.map(
    (l) => `${l.value} = ${l.label} (${l.hint})`,
  ).join("; ");

  return `FAPTE disponibile în condiții (folosește DOAR aceste căi):
${facts}

OPERATORI disponibili (folosește DOAR aceste id-uri):
${operators}

ACȚIUNI disponibile pentru categoria ${category} (folosește DOAR aceste tipuri):
${actions}

PRIORITĂȚI permise: ${priorities}.
Sumele de bani sunt întotdeauna în bani/cenți (întregi): 100 lei = 10000.`;
}
