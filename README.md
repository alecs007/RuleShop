# 🛍️ RuleShop

RuleShop is an online store where the important decisions — discounts, shipping,
fraud checks, availability, loyalty points and theming — are not written in code,
but configured as rules from an **admin control plane**. Changing how the store
behaves means publishing a new version of the rules. No recompilation, no
redeploy.

🥇 Built for **OPEN InfoEducație 2026, Web section** — **gold medal (second
prize)**.

---

## ✨ Features

**The rule engine.** A rule is a condition tree (`AND` / `OR` / `NOT`) with
leaves of the form `(fact, operator, value)` and a list of actions. All six
decision points — pricing, shipping, fraud, availability, loyalty, theme — use
the same engine, the same operators and the same conflict resolution mechanism.
Every evaluation returns the decision along with its explanation: the rules that
matched, the conditions evaluated and the values found.

**Control plane.** A rule editor with logical groups, operators filtered by fact
type, parameterised actions and named priorities. Every rule is automatically
translated into natural language, and the testers show the effect before
publishing. Includes management of products, orders, customers and shipping
methods.

**Versioning.** Publishing creates an immutable snapshot with a diff and a
checksum. Rollback by repointing the active version, a per-category kill switch,
deterministic canary cohorts, an evaluation history and an audit log.

**Storefront.** A catalog with search, filters and sorting, a persistent cart,
checkout with simulated payment, guest or account purchase, order history. The
customer sees what the price is made of and which rules acted on it.

**AI module** (Google Gemini). Analyses rules, generates rules from natural
language requirements and classifies fraud incidents. The model does not evaluate
rules, the statistics are computed by the application by re-running the candidate
version over real evaluations, and publishing stays manual. The same functions
are also exposed through a purpose-built MCP server. Details in
[`docs/AI.md`](docs/AI.md).

**Multi-tenant.** Several stores served from the same instance, isolated at the
level of catalog, rules, orders and customers.

---

## 🧱 Architecture

```
packages/rule-engine/   @ruleshop/rule-engine — the rule engine, no I/O
packages/rate-limit/    @ruleshop/rate-limit  — rate limiting (GCRA)
apps/web/               the Next.js app: storefront, control plane, API, MCP
```

The engine receives a rule snapshot and a fact context and returns the decision
together with its explanation. It does not touch the database and performs no
I/O, so it runs identically in the storefront, in tests and in simulations over
historical events. The application layers are described in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🛠️ Tech stack

![NextJS](https://img.shields.io/badge/next%20js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
[Zod](https://img.shields.io/badge/Zod-000000?style=for-the-badge&logo=zod&logoColor=3068B7)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
[Vitest](https://img.shields.io/badge/Vitest-%236E9F18?style=for-the-badge&logo=Vitest&logoColor=%23fcd703)
[Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![PNPM](https://img.shields.io/badge/pnpm-%234a4a4a.svg?style=for-the-badge&logo=pnpm&logoColor=f69220)

---

## 🚀 Local setup

Node.js ≥ 20.11, pnpm ≥ 10 and Docker are required.

```bash
git clone <repo-url> && cd RuleShop
pnpm install
cp apps/web/.env.example apps/web/.env   # fill in AUTH_SECRET
docker compose up -d                      # MongoDB (replica set), Redis, MinIO
pnpm db:push
pnpm db:seed
pnpm create-admin --email admin@ruleshop.dev --store ruleshop-ro
pnpm dev
```

The storefront is at [localhost:3000](http://localhost:3000), the control plane
at `/admin`, with sign-in at `/auth/admin`. Without `--password`, the admin
account's password is generated randomly and shown only once.

The seed creates two isolated stores (`ruleshop-ro`, `ruleshop-de`), 19 products,
the six rulesets published as version 1, plus 11 customers, 42 orders, fraud
incidents and 280 evaluations in the history. It is deterministic and idempotent.

### Other commands

```bash
pnpm test          # all tests
pnpm typecheck     # type checking across the whole workspace
pnpm build         # production build
pnpm mcp           # the MCP server (stdio)
pnpm db:studio     # inspect the database
pnpm product-art   # regenerate the product images

pnpm --filter @ruleshop/rule-engine test
```

---

## ⚙️ Configuration

Variables go in `apps/web/.env` (full template in `.env.example`).

| Variable                                 | Required    | Role                                                          |
| ---------------------------------------- | ----------- | ------------------------------------------------------------- |
| `DATABASE_URL`                           | yes         | MongoDB; replica set, for transactions                        |
| `AUTH_SECRET`                            | yes         | Session signing (`openssl rand -base64 32`)                   |
| `AUTH_URL`                               | —           | The public address of the app                                 |
| `AUTH_TRUST_HOST`                        | proxy       | Needed behind a reverse proxy                                 |
| `REDIS_URL`                              | —           | Rate limiting. Without it, limiting stays in process memory   |
| `AUTH_GOOGLE_ID` / `_SECRET`             | —           | Customer sign-in with Google                                  |
| `AUTH_FACEBOOK_ID` / `_SECRET`           | —           | Customer sign-in with Facebook                                |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_*`       | —           | Image storage. Without them the disk is used (`UPLOAD_DIR`)   |
| `GEMINI_API_KEY`                         | —           | Enables the AI module                                         |
| `GEMINI_MODEL`                           | —           | Defaults to `gemini-flash-latest`                             |
| `MCP_API_TOKEN`                          | MCP         | Service token for the MCP server                              |
| `DEFAULT_STORE_SLUG`                     | —           | Development override for the active store                     |

---

## 🏪 Multiple stores

- **The active store** is the one served to customers, marked `isDefault` in the
  database. It is changed from **Stores → "Make active"**, without a redeploy.
  `DEFAULT_STORE_SLUG`, as long as it is set, takes precedence.
- **The administered store** is the one opened in the control plane. A
  `PLATFORM_ADMIN` can switch it; a `STORE_ADMIN` or an `OPERATOR` stays bound to
  the store on their own account, a restriction enforced on the server.

A store can be turned on or off (`Store.active`); the active one cannot be turned
off until another is designated. A new store starts with the default shipping
methods and the six rulesets published as version 1.

---

## 🔒 Security

- **Server-side authorization** on every admin page, server action and API route,
  with the role read from the database, not from the token.
- **Isolation between stores**: every query filters on `storeId`, and orders are
  tied to their owner through an httpOnly cookie or an account, never through the
  order number.
- **Validation** with Zod at the boundary, plus the engine's semantic validation:
  operator compatibility with the fact type and parameter bounds.
- **Rate limiting** on login, checkout, order code lookup, uploads and AI calls,
  with the policies grouped in
  [`lib/rate-limit`](apps/web/lib/rate-limit/index.ts). Login and code lookup
  reject requests if Redis goes down.
- **Headers**: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, no `X-Powered-By`.
- **Image uploads** validated through magic bytes, with SVG rejected,
  server-generated keys and serving through a dedicated route.
- **Secrets** only in environment variables, staff passwords as bcrypt hashes.

A strict CSP is not implemented, and payment is simulated.

---

## 🩺 Troubleshooting

| ⚠️ Problem                                               | 🛠️ Fix                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 🚫 `Transactions are not supported`, checkout fails      | The database is not a replica set — start it with `docker compose up -d`.                          |
| 🏪 `No store configured`                                 | The demo data is missing: `pnpm db:seed`.                                                          |
| 🔐 Admin sign-in fails with no message                   | `AUTH_SECRET` is missing. Behind a reverse proxy `AUTH_TRUST_HOST=true` is also required.          |
| ⛔ "Too many attempts" on login or checkout              | Rate limiting. It clears after the interval in the message, or when the `ratelimit:*` keys are deleted. |
| 🪟 `EPERM ... query_engine-windows.dll.node`             | A running `pnpm dev` holds the file locked: stop it, then `pnpm db:generate`.                      |
| 🤖 `Gemini responded with 404 ... no longer available`   | Remove `GEMINI_MODEL`; `gemini-flash-latest` is used by default.                                   |
| 🔑 The AI features do not appear in the UI               | `GEMINI_API_KEY` is not configured.                                                                |
| 🐢 The first load of a route is slow in `dev`            | Next compiles the route on first request; this does not happen with `pnpm build && pnpm start`.    |
| 🖼️ Uploaded images do not show up                        | Check the `S3_*` variables, or remove them to store on the local disk.                             |

---

## 📚 Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, the rule model, multi-tenancy
- [`docs/AI.md`](docs/AI.md) — the AI module and the MCP server
- [`packages/rule-engine/README.md`](packages/rule-engine/README.md) — the rule engine
- [`packages/rate-limit/README.md`](packages/rate-limit/README.md) — rate limiting
