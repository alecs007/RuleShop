# The AI module

The AI module assists administrators in analysing and improving the rules.
Model: **Google Gemini** (REST, `generateContent`), configured through
`GEMINI_API_KEY` / `GEMINI_MODEL`. Without a key the platform works normally —
the AI features are disabled and the UI explains how to enable them.

## Principles

1. **The AI does not evaluate rules.** All evaluations are done by our own engine
   (`@ruleshop/rule-engine`). The AI only receives already-computed data and
   makes proposals.
2. **The statistics belong to the application.** The evaluation history
   (`EvaluationEvent`) keeps the full context of the real evaluations from the
   storefront; the simulation (`lib/rules/simulation.ts`) re-evaluates those
   contexts with the engine and computes the metrics. The AI merely interprets
   them.
3. **Human approval is mandatory.** No AI output is published automatically:
   accepted suggestions and generated rules become **DRAFT**s at most;
   publishing stays the existing manual flow (validation + immutable version).
4. **Validation before anything else.** Responses go through Zod, and proposed
   rules through `validateRule` — exactly the validation used for manual editing.
   Whatever does not pass becomes an `INVALID` suggestion, visible but not
   applicable.
5. **Traceability.** Every suggestion keeps the model, the prompt version, the
   SHA-256 digest of the input, the supporting statistics, the raw response and
   who decided and when. Runs and decisions go into the audit log
   (`AI_SUGGESTION_GENERATED / APPROVED / REJECTED`).

## Features

| Feature | Where | What it does |
| --- | --- | --- |
| Ruleset analysis | the category page → "AI assistant" | unused/redundant rules (first found deterministically by the application), proposals for thresholds/priorities/new rules, with confidence and estimated impact |
| Simulation over history | the same panel (no AI) | the current draft vs the active version, over real evaluations; the metrics are also frozen on every published version (`RuleVersion.simulationMetrics`) |
| Generation from natural language | the "New rule" page | requirement → a validated structured rule, saved as a DRAFT and opened in the editor |
| Incident classification | `/admin/fraud` | an opinion — "likely fraud / likely legitimate / insufficient data" — next to the review form; the decision stays with the operator |

## The evaluation history

`recordEvaluation` (asynchronous, capped through the `evaluationLog` policy in
`lib/rate-limit`, which accepts the request when Redis is unavailable) writes
events from the significant points: the product page (PRICING, AVAILABILITY),
cart/checkout (SHIPPING) and checkout (FRAUD, PRICING).
The customer's email is not stored in the context.

## The API and the MCP server

The `/api/v1/ai/*` and `/api/v1/rules` routes accept either an admin session or
the `MCP_API_TOKEN` service token (compared in constant time; the store is
selected with `?store=<slug>`).

Our own MCP server (`mcp/server.mjs`, started with `pnpm mcp`) exposes over
stdio the tools: `list_rules`, `simulate_history`, `analyze_rules`,
`generate_rule` (dry-run by default), `list_suggestions`. It never touches the
database — it talks exclusively to the API, so it inherits the validation, the
multi-tenant isolation, the audit log and the ban on automatic publishing.

MCP client config (e.g. Claude Code):

```json
{
  "mcpServers": {
    "ruleshop": {
      "command": "npm",
      "args": ["run", "mcp"],
      "env": {
        "RULESHOP_URL": "http://localhost:3000",
        "MCP_API_TOKEN": "<the token from .env>",
        "RULESHOP_STORE": "ruleshop-ro"
      }
    }
  }
}
```
