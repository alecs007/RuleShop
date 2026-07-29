# RuleShop — Arhitectură

Platformă web în care deciziile importante ale unui magazin online sunt luate
în timp real de un **rule engine configurabil**, administrat printr-un
**control plane**, cu un modul IA care asistă analiza și îmbunătățirea
regulilor (fără publicare automată). Multi-tenant: minim două magazine
complet izolate.

## Stack

| Strat | Tehnologie |
|---|---|
| Framework | Next.js 15 (App Router, React 19, Server Components) |
| Limbaj | TypeScript strict |
| Bază de date | MongoDB (replica set) prin Prisma ORM |
| Cache / cohorte | Redis (ioredis) — snapshot-uri publicate, rate limiting |
| Autentificare | NextAuth v5 (credentials, sesiuni JWT, roluri verificate pe server) |
| Validare | Zod la fiecare graniță (API, formulare, snapshot-uri de reguli) |
| UI | Tailwind CSS v4, design minimalist (umbre doar `--shadow-subtle`) |
| Teste | Vitest + Testing Library |
| Infra locală | Docker Compose (mongo + redis) |
| IA | Anthropic SDK + server MCP propriu (tools peste control plane) |

## Straturile aplicației

```
app/
  (shop)/            # magazinul: catalog, produs, coș, checkout, cont, comenzi
  (control-plane)/   # admin: rule editor, versiuni, publicare, audit, IA
  auth/              # login / register
  api/v1/            # API versionat (decisioning, shop, admin, ai)
components/
  shop/  control-plane/  ui/
lib/
  engine/            # NUCLEUL: rule engine pur, zero dependințe  ✅ implementat
  db/                # client Prisma + repository-uri scoped pe store
  redis/             # client + cache snapshot-uri
  auth/              # config NextAuth, guards pe roluri
  ai/                # client Anthropic, prompturi, server MCP
  utils/
prisma/schema.prisma # modelul de date (multi-tenant)  ✅ definit
tests/
```

Regula de dependință: `lib/engine` nu importă nimic din restul aplicației
(nu DB, nu Redis, nu Next). Serviciile din `lib/db` îl folosesc, niciodată
invers. Asta îl face testabil izolat și demonstrează „motor implementat de
la zero".

## Rule engine (`lib/engine`) — implementat

- **Reguli = date structurate**, niciodată cod: arbore de condiții
  (`AND`/`OR`/`NOT`, imbricabil) cu frunze `{fact, operator, value}` +
  listă de acțiuni `{type, params}`.
- **Fapte**: căi dot-notation în contextul de evaluare
  (`customer.*`, `cart.*`, `product.*`, `session.*`, `store.*`).
  Fact lipsă ⇒ condiție falsă, niciodată excepție.
- **Operatori** (`operators.ts`): registru tipat (eq, neq, gt/gte/lt/lte,
  between, in/notIn, contains, startsWith/endsWith, containsAny/All,
  exists, isTrue/isFalse). Fiecare declară tipurile de fact compatibile —
  editorul oferă doar operatori compatibili cu tipul datelor (cerință barem).
- **Acțiuni** (`actions.ts`): catalog per categorie de decizie
  (PRICING, SHIPPING, FRAUD, AVAILABILITY, LOYALTY, THEME), funcții pure cu
  parametri validați (intervale, enum-uri).
- **Conflict** (`engine.ts`): 4 strategii per ruleset —
  `PRIORITY_FIRST_MATCH`, `PRIORITY_ALL_MATCHES` (prioritatea mare are
  ultimul cuvânt), `MOST_SPECIFIC` (cele mai multe frunze),
  `BEST_FOR_CUSTOMER` (comparator de beneficiu per categorie).
- **Explicație**: fiecare evaluare produce `trace` complet — per regulă:
  evaluată/sărită/de ce, arborele de condiții cu valoarea găsită și
  rezultatul fiecărei frunze, acțiunile aplicate. Se stochează în istoric.
- **Kill switch**: pe întreg rulesetul (⇒ `defaultDecision`, fail-safe) sau
  granular pe chei de reguli.
- **Canary** (`canary.ts`): FNV-1a peste `storeId:rulesetKey:subjectKey`
  ⇒ bucket stabil [0,100) ⇒ repartizare deterministă (cerință barem).
- **Validare** (`schemas.ts`): Zod (formă) + semantică (operatori/acțiuni
  existente, compatibilitate, intervale, NOT unar, chei duplicate,
  avertisment priorități egale).

## Lifecycle-ul regulilor (modelul din Prisma)

```
Rule (draft editabil)
  └─ publicare ⇒ RuleVersion (snapshot imutabil, checksum, diff, versiune N)
        ├─ RuleSet.activeVersionId  → versiunea stabilă
        └─ RuleSet.canaryVersionId  → versiunea canary (+ canaryPercentage)
```

- Motorul evaluează **exclusiv snapshot-uri** ⇒ rollback = repointare
  `activeVersionId` la o versiune anterioară; nimic de recompilat.
- Diff-ul dintre versiuni este structurat (added/removed/changed) și
  explicabil de modulul IA în limbaj natural.
- Fiecare comandă stochează `decisionSnapshot`, `matchedRuleKeys`,
  `rulesetVersions`, `traceId`, `canaryCohort` ⇒ trasabilitate completă și
  set de date pentru simulare.

## API de decisioning (pasul următor)

`POST /api/v1/stores/{store}/decisions/{category}` — corpul = contextul
(cart, customer, session), răspunsul:

```json
{
  "decision": { "discountPercent": 15 },
  "rulesetVersion": 7,
  "matchedRules": ["vip-discount"],
  "traceId": "eval-8f21"
}
```

Fluxul serverului: sesiune → subjectKey (userId sau sessionKey din cookie) →
`isInCanaryCohort` alege snapshot-ul (stable/canary, din cache-ul Redis,
invalidat la publicare) → `evaluateRuleSet` → persistă evaluarea în istoric →
răspunde. Magazinul consumă acest API pentru preț afișat, cost livrare,
verificare fraudă la checkout, disponibilitate, puncte loialitate și temă.

## „Variante" de magazin (ex: România / Germania)

O variantă **nu este un fork al site-ului**, ci un pachet de reguli THEME +
PRICING + SHIPPING condiționate pe segment (`customer.country eq "DE"`,
`session.locale`, etc.):
tema schimbă tokens CSS/banner/layout prin acțiunile THEME, prețurile și
livrarea prin categoriile lor. Comutarea între variante = activarea/
dezactivarea regulilor sau publicarea altei versiuni — fără cunoștințe
tehnice, din control plane. IA (prin MCP) poate genera un asemenea pachet
dintr-o cerință în limbaj natural, dar publicarea cere aprobare umană
(cerință barem: control uman obligatoriu).

## Modulul IA + MCP (pas ulterior)

Server MCP propriu (`lib/ai/mcp`) expunând tools peste control plane:
`list_rules`, `get_ruleset`, `draft_rule` (generează structura validată Zod),
`simulate_version` (rulează candidatul pe evenimente istorice — metricile le
calculează aplicația, nu IA), `explain_decision`, `analyze_rule_performance`,
`classify_fraud_incident`. Toate scrierile produc **draft-uri** cu
`source: AI_SUGGESTION` + `aiRationale`; publicarea trece obligatoriu prin
aprobarea unui utilizator autorizat (audit: `AI_SUGGESTION_APPROVED`).
IA nu evaluează niciodată reguli — doar le propune/explica; evaluarea este
exclusiv `lib/engine`.

## Securitate & multi-tenancy

- Fiecare entitate are `storeId`; unicități compuse `[storeId, ...]`.
- Acces la date doar prin repository-uri care primesc `storeId` din sesiune
  (niciodată din request) — izolarea nu depinde de disciplina rutelor.
- Roluri: CUSTOMER, OPERATOR, STORE_ADMIN, PLATFORM_ADMIN — verificate pe
  server (middleware + guards per handler).
- Parole: hash bcrypt; secrete doar în `.env` (necomis).
- Plăți simulate printr-un endpoint intern (`/api/v1/.../payments/simulate`)
  cu interfață de provider, ca un procesator real să poată fi conectat
  ulterior fără schimbarea fluxului de checkout.
- Audit log pentru toate operațiile importante (publicări, rollback, kill
  switch, aprobări IA, schimbări de rol).

## Roadmap (ordinea pașilor următori)

1. ✅ Fundație: config, schema Prisma (MongoDB), **nucleul rule engine + teste**
2. `lib/db` (client Prisma, repository-uri scoped) + seed cu 2 magazine demo
3. NextAuth v5: roluri, register/login, sesiuni guest cu `sessionKey` stabil
4. API v1: decisioning + cache Redis + istoric evaluări
5. Magazin: catalog, produs, căutare/filtrare, coș (guest + auth)
6. Checkout cu plată simulată + decizii vizibile în UI; comenzi + istoric
7. Control plane: CRUD reguli, editor structurat, validare live, test sandbox
8. Versionare: publish stable/canary, diff, rollback, kill switch, audit UI
9. Modul IA + server MCP + simulare pe evenimente istorice + aprobare umană
10. Temă/variante, finisaje responsive, documentație, date demo, Dockerfile
