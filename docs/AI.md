# Modulul de inteligență artificială

Modulul AI asistă administratorii la analiza și îmbunătățirea regulilor.
Model: **Google Gemini** (REST, `generateContent`), configurat prin
`GEMINI_API_KEY` / `GEMINI_MODEL`. Fără cheie, platforma funcționează normal —
funcțiile AI sunt dezactivate, iar interfața explică cum se activează.

## Principii

1. **AI nu evaluează reguli.** Toate evaluările le face motorul propriu
   (`@ruleshop/rule-engine`). AI primește doar date deja calculate și propune.
2. **Statisticile sunt ale aplicației.** Istoricul de evaluări
   (`EvaluationEvent`) reține contextul complet al evaluărilor reale din
   magazin; simularea (`lib/rules/simulation.ts`) re-evaluează acele contexte
   cu motorul și calculează metricile. AI doar le interpretează.
3. **Aprobare umană obligatorie.** Nicio ieșire AI nu se publică automat:
   sugestiile acceptate și regulile generate devin cel mult **DRAFT**-uri;
   publicarea rămâne fluxul manual existent (validare + versiune imutabilă).
4. **Validare înainte de orice.** Răspunsurile trec prin Zod, iar regulile
   propuse prin `validateRule` — exact validarea folosită la editarea manuală.
   Ce nu trece devine sugestie `INVALID`, vizibilă dar neaplicabilă.
5. **Trasabilitate.** Fiecare sugestie păstrează modelul, versiunea
   promptului, digestul SHA-256 al intrării, statisticile-suport, răspunsul
   brut și cine/când a decis. Rulările și deciziile intră în jurnalul de audit
   (`AI_SUGGESTION_GENERATED / APPROVED / REJECTED`).

## Funcții

| Funcție | Unde | Ce face |
| --- | --- | --- |
| Analiza rulesetului | pagina categoriei → „Asistent AI" | reguli nefolosite/redundante (constatate întâi determinist de aplicație), propuneri de praguri/priorități/reguli noi, cu încredere și impact estimat |
| Simulare pe istoric | același panou (fără AI) | draftul curent vs versiunea activă, pe evaluări reale; metricile se îngheață și pe fiecare versiune publicată (`RuleVersion.simulationMetrics`) |
| Generare din limbaj natural | pagina „Regulă nouă" | cerință → regulă structurată validată, salvată ca DRAFT și deschisă în editor |
| Clasificare incidente | `/admin/fraud` | opinie „probabil fraudă / probabil legitim / date insuficiente" lângă formularul de review; decizia rămâne a operatorului |

## Istoricul de evaluări

`recordEvaluation` (asincron, plafonat prin politica `evaluationLog` din
`lib/rate-limit`, care acceptă cererea la indisponibilitatea Redis) scrie
evenimente din punctele semnificative: pagina de produs (PRICING,
AVAILABILITY), coș/checkout (SHIPPING) și checkout (FRAUD, PRICING).
Emailul clientului nu se stochează în context.

## API și serverul MCP

Rutele `/api/v1/ai/*` și `/api/v1/rules` acceptă fie sesiune de admin, fie
tokenul de serviciu `MCP_API_TOKEN` (comparat în timp constant; magazinul se
alege cu `?store=<slug>`).

Serverul MCP propriu (`mcp/server.mjs`, pornit cu `pnpm mcp`) expune prin
stdio tool-urile: `list_rules`, `simulate_history`, `analyze_rules`,
`generate_rule` (implicit dry-run), `list_suggestions`. Nu atinge baza de
date — vorbește exclusiv cu API-ul, deci moștenește validarea, izolarea
multi-tenant, auditul și interdicția de publicare automată.

Config client MCP (ex. Claude Code):

```json
{
  "mcpServers": {
    "ruleshop": {
      "command": "npm",
      "args": ["run", "mcp"],
      "env": {
        "RULESHOP_URL": "http://localhost:3000",
        "MCP_API_TOKEN": "<tokenul din .env>",
        "RULESHOP_STORE": "ruleshop-ro"
      }
    }
  }
}
```
