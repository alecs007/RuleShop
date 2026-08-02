# RuleShop — Architecture

A web platform where the important decisions of an online store are made in real
time by a **configurable rule engine**, administered through a **control plane**,
with an AI module that assists in analysing and improving the rules (without
automatic publishing). Multi-tenant: at least two fully isolated stores.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19, Server Components) |
| Language | TypeScript, strict |
| Database | MongoDB (replica set) through Prisma ORM |
| Redis | ioredis — rate limiting (GCRA), canary cohorts |
| Authentication | NextAuth v5 (credentials, JWT sessions, roles verified on the server) |
| Validation | Zod at every boundary (API, forms, rule snapshots) |
| UI | Tailwind CSS v4, minimal design (shadows only `--shadow-subtle`) |
| Tests | Vitest + Testing Library |
| Local infra | Docker Compose (mongo + redis + minio) |
| Monorepo | pnpm workspaces (`apps/` + `packages/`) |
| AI | Google Gemini + a purpose-built MCP server (tools over the control plane) |

## Application layers

pnpm monorepo: the application in `apps/`, everything that does not depend on it
in `packages/`.

```
packages/
  rule-engine/       # THE CORE: a pure rule engine, no I/O  (@ruleshop/rule-engine)
  rate-limit/        # GCRA rate limiting                    (@ruleshop/rate-limit)
apps/web/
  app/
    (shop)/          # the storefront: catalog, product, cart, checkout, account, orders
    (control-plane)/ # admin: rule editor, versions, publishing, audit, AI
    auth/            # login / register
    api/v1/          # versioned API (decisioning, shop, admin, ai)
  components/
    shop/  control-plane/  ui/
  lib/
    rules/           # the rule lifecycle on top of the engine (versions, publishing)
    shop/            # the storefront decision points
    db/              # Prisma client + store-scoped queries
    redis/           # the Redis client
    rate-limit/      # the named policies, on top of @ruleshop/rate-limit
    auth/            # NextAuth config, role guards
    ai/              # Gemini client, prompts
  prisma/schema.prisma # the data model (multi-tenant)
  mcp/               # the MCP server
  tests/
```

The dependency rule: `@ruleshop/rule-engine` imports nothing from the application
(no DB, no Redis, no Next) — which is why it lives in a separate package, where
the constraint is enforced by structure rather than by discipline. The services
in `apps/web/lib/` use it, never the other way round.

## Rule engine (`packages/rule-engine`) — implemented

- **Rules are structured data**, never code: a condition tree
  (`AND`/`OR`/`NOT`, nestable) with `{fact, operator, value}` leaves +
  a list of `{type, params}` actions.
- **Facts**: dot-notation paths into the evaluation context
  (`customer.*`, `cart.*`, `product.*`, `session.*`, `store.*`).
  A missing fact ⇒ a false condition, never an exception.
- **Operators** (`operators.ts`): a typed registry (eq, neq, gt/gte/lt/lte,
  between, in/notIn, contains, startsWith/endsWith, containsAny/All,
  exists, isTrue/isFalse). Each declares the fact types it is compatible with, and
  the editor offers only the operators that fit the selected fact's type.
- **Actions** (`actions.ts`): a catalog per decision category
  (PRICING, SHIPPING, FRAUD, AVAILABILITY, LOYALTY, THEME), pure functions with
  validated parameters (ranges, enums).
- **Conflict** (`engine.ts`): 4 strategies per ruleset —
  `PRIORITY_FIRST_MATCH`, `PRIORITY_ALL_MATCHES` (the highest priority has the
  last word), `MOST_SPECIFIC` (the most leaves),
  `BEST_FOR_CUSTOMER` (a benefit comparator per category).
- **Explanation**: every evaluation produces a full `trace` — per rule:
  evaluated/skipped/why, the condition tree with the value found and
  the result of each leaf, the actions applied. It is stored in the history.
- **Kill switch**: over the whole ruleset (⇒ `defaultDecision`, fail-safe) or
  granularly on rule keys.
- **Canary** (`canary.ts`): FNV-1a over `storeId:rulesetKey:subjectKey`
  ⇒ a stable bucket in [0,100) ⇒ deterministic assignment to cohorts.
- **Validation** (`schemas.ts`): Zod (shape) + semantics (operators/actions
  exist, compatibility, ranges, unary NOT, duplicate keys,
  a warning for equal priorities).

## The rule lifecycle (the Prisma model)

```
Rule (editable draft)
  └─ publish ⇒ RuleVersion (immutable snapshot, checksum, diff, version N)
        ├─ RuleSet.activeVersionId  → the stable version
        └─ RuleSet.canaryVersionId  → the canary version (+ canaryPercentage)
```

- The engine evaluates **snapshots only** ⇒ rollback = repointing
  `activeVersionId` to an earlier version; nothing to recompile.
- The diff between versions is structured (added/removed/changed) and can be
  explained by the AI module in natural language.
- Every order stores `decisionSnapshot`, `matchedRuleKeys`,
  `rulesetVersions`, `traceId`, `canaryCohort` ⇒ full traceability and a
  data set for simulation.

## The decisioning API

The storefront consumes decisions through the service layer in `lib/shop/` (each
decision point has a pure core, used identically by the storefront, by the
control plane testers and by the tests). Exposing them as a public HTTP endpoint
remains a next step; the shape of the response is already the one below:

`POST /api/v1/stores/{store}/decisions/{category}` — the body is the context
(cart, customer, session), the response:

```json
{
  "decision": { "discountPercent": 15 },
  "rulesetVersion": 7,
  "matchedRules": ["vip-discount"],
  "traceId": "eval-8f21"
}
```

The server flow: session → subjectKey (userId or the sessionKey from the cookie) →
`isInCanaryCohort` picks the snapshot (stable/canary) → `evaluateRuleSet` →
persist the evaluation in the history → respond. The active snapshot is read
straight from the database, deduplicated per request with React's `cache()`: a
cache with an expiry would introduce a window in which the storefront still
serves the previous version after a publish — which is exactly the guarantee the
project rests on. The storefront consumes this API for the displayed price,
shipping cost, the fraud check at checkout, availability, loyalty points and the
theme.

## Store "variants" (e.g. Romania / Germany)

A variant is **not a fork of the site**, but a bundle of THEME + PRICING +
SHIPPING rules conditioned on a segment (`customer.country eq "DE"`,
`customer.loyaltyTier eq "VIP"`, etc.):
the theme changes CSS tokens/banner/layout through the THEME actions, the prices
and shipping through their own categories. Switching between variants means
enabling/disabling rules or publishing another version — no technical knowledge
required, straight from the control plane. The AI (through MCP) can generate such
a bundle from a natural language requirement, but publishing still depends on the
approval of a human operator.

The theme is applied in `app/(shop)/layout.tsx`: the tokens become **custom CSS
properties** on the storefront wrapper (React's `style` object), not concatenated
CSS text. Three independent barriers keep the rules away from the page's styling:
the action catalog accepts only tokens from `THEME_TOKENS` and values that pass
`THEME_VALUE_PATTERN` (checked both on save **and** on publish);
`computeTheme` re-validates both, for old snapshots or ones written through the
API; and applying them through the CSSOM has no syntax to escape. Whatever does
not pass is reported in `rejectedTokens`, visible in the control plane tester.

## The AI module + MCP — implemented

The provider (Google Gemini) lives in `lib/ai/`, the MCP server in
`mcp/server.mjs` (started with `pnpm mcp`), the HTTP routes under
`app/api/v1/ai/`. Functions: rule analysis, generating a rule from natural
language, classifying fraud incidents, simulation over historical events.

The architectural guarantees — the AI does not evaluate rules, the statistics are
computed by the application, human approval is mandatory before publishing — are
described in [`AI.md`](AI.md).

## Security & multi-tenancy

- Every entity has a `storeId`; compound uniqueness constraints `[storeId, ...]`.
- Data access only through repositories that receive `storeId` from the session
  (never from the request) — isolation does not depend on route discipline.
- Two distinct store resolutions, both on the server: what customers see comes
  from `getActiveStore()` (override `DEFAULT_STORE_SLUG` → `Store.isDefault` →
  the first one that is on, all requiring `active: true`), while the control
  plane uses `getAdminStoreId()`. Switching from the control plane is possible
  **only** for `PLATFORM_ADMIN`: for everyone else, `User.storeId` takes
  precedence over any cookie (`resolveAdminStoreId`, tested separately).
- Roles: CUSTOMER, OPERATOR, STORE_ADMIN, PLATFORM_ADMIN — verified on the
  server (middleware + per-handler guards).
- Passwords: bcrypt hashes; secrets only in `.env` (not committed).
- Payments simulated through an internal endpoint
  (`/api/v1/.../payments/simulate`) with a provider interface, so that a real
  processor can be connected later without changing the checkout flow.
- An audit log for all important operations (publishes, rollbacks, kill
  switches, AI approvals, role changes).

## Status

1. ✅ Foundation: config, Prisma schema (MongoDB), **the rule engine core + tests**
2. ✅ `lib/db` (Prisma client, store-scoped access) + a seed with 2 demo stores
3. ✅ NextAuth v5: roles, staff login, guest sessions with a stable `sessionKey`
4. ✅ Evaluation history (`EvaluationEvent`) + Redis rate limiting
5. ✅ Storefront: catalog, product, search/filtering, cart (guest + authenticated)
6. ✅ Checkout with simulated payment + decisions visible in the UI; orders + tracking
7. ✅ Control plane: rule CRUD, structured editor, validation, per-category testers
8. ✅ Versioning: publishing, diff, rollback, kill switch, audit
9. ✅ AI module + MCP server + simulation over historical events + human approval
10. ✅ All six decision points: pricing, shipping, fraud,
    availability, loyalty, theme — plus demo rules published by the
    seed for every category, in both stores
11. ⬜ Remaining: canary publishing in the UI, an evaluation history page,
    a public decisioning endpoint
