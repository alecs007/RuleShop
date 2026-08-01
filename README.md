# 🛍️ RuleShop

RuleShop este un magazin online în care deciziile importante — reducerile, livrarea,
verificarea antifraudă, disponibilitatea, punctele de loialitate și tema — nu
sunt scrise în cod, ci configurate ca reguli, dintr-un **panou de administrare**. Pentru a fi schimbat felul în care se comportă magazinul, se configurează o versiune nouă de
reguli. Fără recompilare, fără redeploy.

🥇 Proiect realizat pentru **OPEN InfoEducație 2026, secțiunea Web** — **medalie de aur
(premiul II)**.

---

## ✨ Funcționalități

**Motorul de reguli.** O regulă este un arbore de condiții (`AND` / `OR` / `NOT`)
cu frunze de forma `(fapt, operator, valoare)` și o listă de acțiuni. Cele șase
puncte de decizie — preț, livrare, antifraudă, disponibilitate, loialitate, temă —
folosesc același motor, aceiași operatori și același mecanism de rezolvare a
conflictelor. Fiecare evaluare întoarce decizia și explicația ei: regulile
potrivite, condițiile evaluate și valorile găsite.

**Control plane.** Editor de reguli cu grupări logice, operatori filtrați după
tipul faptului, acțiuni parametrizate și priorități denumite. Fiecare regulă este
tradusă automat în limbaj natural, iar testerele arată efectul înainte de
publicare. Include administrarea produselor, comenzilor, clienților și a
metodelor de livrare.

**Versionare.** Publicarea creează un snapshot imutabil cu diff și checksum.
Rollback prin repointarea versiunii active, kill switch per categorie, cohorte
canary deterministe, istoric de evaluări și jurnal de audit.

**Magazin.** Catalog cu căutare, filtre și sortare, coș persistent, checkout cu
plată simulată, cumpărare ca vizitator sau cu cont, istoric de comenzi. Clientul
vede din ce se compune prețul și ce reguli au acționat.

**Modul AI** (Google Gemini). Analizează regulile, generează reguli din cerințe în
limbaj natural și clasifică incidentele antifraudă. Modelul nu evaluează reguli,
statisticile sunt calculate de aplicație prin re-rularea versiunii candidat pe
evaluări reale, iar publicarea rămâne manuală. Aceleași funcții sunt expuse și
printr-un server MCP propriu. Detalii în [`docs/AI.md`](docs/AI.md).

**Multi-tenant.** Mai multe magazine servite din aceeași instanță, izolate la
nivel de catalog, reguli, comenzi și clienți.

---

## 🧱 Arhitectură

```
packages/rule-engine/   @ruleshop/rule-engine — motorul de reguli, fără I/O
packages/rate-limit/    @ruleshop/rate-limit  — limitare de rată (GCRA)
apps/web/               aplicația Next.js: magazin, control plane, API, MCP
```

Motorul primește un snapshot de reguli și un context de fapte și întoarce decizia
împreună cu explicația ei. Nu accesează baza de date și nu execută operații de
I/O, deci rulează identic în magazin, în teste și în simulările pe evenimente
istorice. Straturile aplicației sunt descrise în
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🛠️ Tehnologii

- ⚛️ Next.js 15 (App Router, Server Components, Server Actions)
- 🟦 TypeScript
- 🍃 MongoDB + Prisma
- 🔐 NextAuth v5
- ⚡ Redis (ioredis)
- ✅ Zod
- 🎨 Tailwind CSS v4
- 🧪 Vitest
- 🤖 Google Gemini
- 🔌 Model Context Protocol (MCP)
- 🐳 Docker Compose
- 📦 pnpm workspaces

---

## 🚀 Instalare locală

Sunt necesare Node.js ≥ 20.11, pnpm ≥ 10 și Docker.

```bash
git clone <url-repo> && cd RuleShop
pnpm install
cp apps/web/.env.example apps/web/.env   # se completează AUTH_SECRET
docker compose up -d                      # MongoDB (replica set), Redis, MinIO
pnpm db:push
pnpm db:seed
pnpm create-admin --email admin@ruleshop.dev --store ruleshop-ro
pnpm dev
```

Magazinul este la [localhost:3000](http://localhost:3000), control plane-ul la
`/admin`, cu autentificare la `/auth/admin`. Fără `--password`, parola contului
de administrator se generează aleatoriu și se afișează o singură dată.

Seed-ul creează două magazine izolate (`ruleshop-ro`, `ruleshop-de`), 19 produse,
cele șase rulesete publicate ca versiunea 1, plus 11 clienți, 42 de comenzi,
incidente antifraudă și 280 de evaluări în istoric. Este determinist și
idempotent.

### Alte comenzi

```bash
pnpm test          # toate testele
pnpm typecheck     # verificarea tipurilor, pe tot workspace-ul
pnpm build         # build de producție
pnpm mcp           # serverul MCP (stdio)
pnpm db:studio     # inspectarea bazei de date
pnpm product-art   # regenerează imaginile de produs

pnpm --filter @ruleshop/rule-engine test
```

---

## ⚙️ Configurare

Variabilele se pun în `apps/web/.env` (model complet în `.env.example`).

| Variabilă                                | Obligatorie | Rol                                                          |
| ---------------------------------------- | ----------- | ------------------------------------------------------------ |
| `DATABASE_URL`                           | da          | MongoDB; replica set, pentru tranzacții                       |
| `AUTH_SECRET`                            | da          | Semnarea sesiunilor (`openssl rand -base64 32`)               |
| `AUTH_URL`                               | —           | Adresa publică a aplicației                                    |
| `AUTH_TRUST_HOST`                        | proxy       | Necesară în spatele unui reverse proxy                        |
| `REDIS_URL`                              | —           | Limitare de rată. Fără ea, limitarea rămâne în memorie        |
| `AUTH_GOOGLE_ID` / `_SECRET`             | —           | Autentificarea clienților cu Google                            |
| `AUTH_FACEBOOK_ID` / `_SECRET`           | —           | Autentificarea clienților cu Facebook                          |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_*`       | —           | Stocarea imaginilor. Fără ele se folosește discul (`UPLOAD_DIR`) |
| `GEMINI_API_KEY`                         | —           | Activează modulul AI                                           |
| `GEMINI_MODEL`                           | —           | Implicit `gemini-flash-latest`                                 |
| `MCP_API_TOKEN`                          | MCP         | Token de serviciu pentru serverul MCP                          |
| `DEFAULT_STORE_SLUG`                     | —           | Override de dezvoltare pentru magazinul activ                  |

---

## 🏪 Magazine multiple

- **Magazinul activ** este cel servit clienților, marcat `isDefault` în baza de
  date. Se schimbă din **Magazine → „Fă-l activ"**, fără redeploy.
  `DEFAULT_STORE_SLUG`, cât timp este setată, are prioritate.
- **Magazinul administrat** este cel deschis în panou. Un `PLATFORM_ADMIN` îl
  comută; un `STORE_ADMIN` sau un `OPERATOR` rămâne legat de magazinul din contul
  propriu, restricție verificată pe server.

Un magazin poate fi pornit sau oprit (`Store.active`); cel activ nu poate fi
oprit până nu este desemnat altul. Un magazin nou pornește cu metodele de livrare
implicite și cele șase rulesete publicate ca versiunea 1.

---

## 🔒 Securitate

- **Autorizare pe server** la fiecare pagină de admin, server action și rută de
  API, cu rolul citit din baza de date, nu din token.
- **Izolare între magazine**: fiecare interogare filtrează pe `storeId`, iar
  comenzile se leagă de proprietar prin cookie httpOnly sau cont, niciodată prin
  numărul comenzii.
- **Validare** cu Zod la intrare, plus validarea semantică a motorului:
  compatibilitatea operatorilor cu tipul faptului și încadrarea parametrilor.
- **Limitare de rată** pe login, checkout, verificarea codului de comandă,
  încărcări și apeluri AI, cu politicile grupate în
  [`lib/rate-limit`](apps/web/lib/rate-limit/index.ts). Login-ul și verificarea
  codului refuză cererile dacă Redis cade.
- **Antete**: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, fără `X-Powered-By`.
- **Încărcări de imagini** validate prin magic bytes, cu SVG respins, chei
  generate de server și servire printr-o rută dedicată.
- **Secrete** doar în variabile de mediu, parole de staff ca hash bcrypt.

Nu este implementat un CSP strict, iar plata este simulată.

---

## 🩺 Troubleshooting

| ⚠️ Problemă                                              | 🛠️ Rezolvare                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 🚫 `Transactions are not supported`, checkout eșuat      | Baza de date nu este replica set — se pornește cu `docker compose up -d`.                          |
| 🏪 `Niciun magazin configurat`                           | Lipsesc datele demo: `pnpm db:seed`.                                                                |
| 🔐 Autentificarea de admin eșuează fără mesaj            | Lipsește `AUTH_SECRET`. În spatele unui reverse proxy este necesar și `AUTH_TRUST_HOST=true`.      |
| ⛔ „Prea multe încercări" la login sau checkout          | Limitarea de rată. Trece după intervalul din mesaj sau la ștergerea cheilor `ratelimit:*`.         |
| 🪟 `EPERM ... query_engine-windows.dll.node`             | Un `pnpm dev` pornit ține fișierul blocat: se oprește, apoi `pnpm db:generate`.                    |
| 🤖 `Gemini a răspuns cu 404 ... no longer available`     | Se elimină `GEMINI_MODEL`; implicit se folosește `gemini-flash-latest`.                             |
| 🔑 Funcțiile AI nu apar în interfață                     | Nu este configurată `GEMINI_API_KEY`.                                                               |
| 🐢 Prima încărcare a unei rute este lentă în `dev`       | Next compilează ruta la prima cerere; nu se întâmplă la `pnpm build && pnpm start`.                 |
| 🖼️ Imaginile încărcate nu apar                           | Se verifică `S3_*` sau se șterg, pentru stocare pe disc local.                                     |

---

## 📚 Documentație

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — straturi, modelul regulilor, multi-tenancy
- [`docs/AI.md`](docs/AI.md) — modulul AI și serverul MCP
- [`packages/rule-engine/README.md`](packages/rule-engine/README.md) — motorul de reguli
- [`packages/rate-limit/README.md`](packages/rate-limit/README.md) — limitarea de rată
