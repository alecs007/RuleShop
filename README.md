# 🛍️ RuleShop

Magazin online în care deciziile importante — prețuri, livrare, antifraudă,
disponibilitate, loialitate, temă — nu sunt scrise în cod, ci administrate în timp real
de un **rule engine configurabil**, accesat dintr-un **control plane**.
Un administrator schimbă comportamentul magazinului publicând o versiune nouă de
reguli: fără recompilare, fără redeploy.

Motorul de reguli este implementat de la zero (`lib/engine/`), fără biblioteci
specializate. Platforma este multi-tenant: două magazine independente, complet
izolate.

---

## ✨ Funcționalități

**Magazinul** — catalog cu căutare, filtre și sortare, pagină de produs, coș
persistent, checkout cu plată simulată (în spatele unei interfețe de provider),
cumpărare ca guest sau cu cont, istoric de comenzi cu urmărirea statusului.
Deciziile motorului sunt vizibile clientului: de ce are prețul acesta, ce reguli
au acționat, ce s-a întâmplat la verificarea antifraudă.

**Control plane** — editor de reguli structurat (condiții cu grupări AND/OR/NOT,
operatori filtrați după tipul faptului, acțiuni, priorități denumite), traducere
automată a fiecărei reguli în limbaj natural („DACĂ … ATUNCI …"), testere care
arată efectul unei reguli _înainte_ de publicare, gestionarea produselor,
comenzilor, clienților și a metodelor de livrare.

**Ciclul de viață al regulilor** — versiuni imutabile cu diff și checksum,
publicare, rollback prin repointare, kill switch per categorie, strategii de
rezolvare a conflictelor, istoric de evaluări și jurnal de audit pentru
operațiile importante.

**Punctele de decizie** — șase categorii (prețuri, livrare, antifraudă,
disponibilitate, loialitate, temă) trec prin **același motor generic**. Nu există
logică hardcodată per caz: o regulă nouă de disponibilitate folosește aceleași
condiții, operatori și mecanism de conflict ca una de preț.

**Modulul AI** (Google Gemini) — analizează regulile și propune îmbunătățiri,
generează reguli structurate din cerințe în limbaj natural, clasifică incidentele
antifraudă. Trei garanții, detaliate în [`docs/AI.md`](docs/AI.md):

- AI-ul **nu evaluează** niciodată reguli — evaluarea rămâne a motorului;
- **statisticile sunt calculate de aplicație**, nu declarate de model: simularea
  re-rulează versiunea candidat pe evenimente de evaluare reale și compară
  metricile cu versiunea activă;
- **aprobarea umană este obligatorie** — orice ieșire AI devine cel mult un
  _draft_, iar publicarea rămâne o acțiune manuală.

Capabilitățile de analiză sunt expuse și printr-un **server MCP** propriu
(`mcp/server.mjs`), care vorbește cu aplicația prin API — deci moștenește
aceleași validări, izolare și interdicție de publicare automată.

**Securitate** — autentificare și autorizare pe roluri verificate pe server,
izolare strictă între magazine, validare cu Zod plus validarea semantică a
motorului, rate limiting pe login/checkout/AI, headere de securitate, parole
bcrypt, secrete doar în variabile de mediu.

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
- 🔌 Model Context Protocol (MCP) SDK
- 🐳 Docker Compose

---

## 🚀 Instalare și rulare local

Ai nevoie de Node.js ≥ 20.11 și Docker.

```bash
git clone <url-repo> && cd RuleShop
npm install
cp .env.example .env
```

Completează în `.env` cel puțin `AUTH_SECRET` (generează cu
`openssl rand -base64 32`). Pornește serviciile și baza de date:

```bash
docker compose up -d
```

MongoDB pornește ca **replica set** — Prisma are nevoie de el pentru tranzacții
(plasarea comenzilor, publicarea versiunilor). Apoi:

```bash
npm run db:push
npm run db:seed
```

Seed-ul creează două magazine independente (`ruleshop-ro`, `ruleshop-de`), un
catalog demo de 19 produse în cinci categorii și — pentru fiecare dintre cele
**șase categorii de decizie** — un set de reguli plauzibile, publicate ca
versiunea 1: reduceri VIP și pe categorii, livrare gratuită peste un prag,
verificări antifraudă cu scor, plafoane de cantitate la stoc redus, puncte de
loialitate cu multiplicatori și o temă care se schimbă în funcție de client.
Regulile trec prin aceeași validare a motorului ca o publicare din control
plane, iar re-rularea seed-ului nu creează versiuni noi dacă nimic nu s-a
schimbat. Toate se pot edita, dezactiva sau șterge din interfață.

Creează-ți un cont de administrator:

```bash
npm run create-admin -- --email admin@ruleshop.dev --store ruleshop-ro
```

Fără `--password`, se generează una aleatorie și se afișează o singură dată.
Pornește aplicația:

```bash
npm run dev
```

Magazinul e la [localhost:3000](http://localhost:3000), control plane-ul la
`/admin` (login la `/auth/admin`).

### Mai multe magazine

Platforma servește mai multe magazine din aceeași instanță, complet izolate
(catalog, reguli, comenzi, clienți). Două noțiuni distincte:

- **magazinul activ** — cel pe care îl văd clienții. Este magazinul marcat
  `isDefault` în baza de date; se schimbă din **Magazine → „Fă-l activ"**, fără
  deploy și fără restart. `DEFAULT_STORE_SLUG` din `.env` este doar un override
  de dezvoltare și, cât timp e setat, are prioritate;
- **magazinul administrat** — cel pe care lucrezi în panou. Un `PLATFORM_ADMIN`
  îl comută din comutatorul din capul sidebar-ului (pe ecrane mici, direct din
  header); un `STORE_ADMIN` sau `OPERATOR` rămâne legat de magazinul din contul
  lui și nu poate comuta (verificat pe server, nu ascuns doar în interfață).

Separat de acestea, un magazin poate fi **pornit sau oprit** (`Store.active`):
unul oprit nu se servește clienților și nu poate fi administrat. Magazinul activ
nu poate fi oprit — mai întâi faci activ alt magazin.

Un magazin nou se creează din **Magazine → Magazin nou** (nume, slug, monedă,
limbă) și pornește funcțional: metodele de livrare implicite și toate cele șase
rulesete publicate ca versiunea 1, aceleași pe care le primește un magazin din
seed. Produsele se adaugă după, din `Produse`. Doar `PLATFORM_ADMIN` vede pagina
și poate crea magazine.

**Opțional** — modulul AI: pune o cheie de la
[Google AI Studio](https://aistudio.google.com/apikey) în `GEMINI_API_KEY`. Fără
ea, platforma funcționează normal, doar funcțiile AI sunt dezactivate și
interfața explică de ce.

Alte comenzi utile:

```bash
npm test           # suita de teste (Vitest)
npm run typecheck  # verificare de tipuri
npm run mcp        # serverul MCP (stdio)
npm run db:studio  # inspectarea bazei de date
```

---

## 📦 Rulare în regim de producție

Aceleași servicii din `docker compose`, dar aplicația compilată:

```bash
npm run build
npm start
```

Verifică apoi starea:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","database":"ok","timestamp":"..."}
```

Imaginile produselor se salvează implicit pe disc (`storage/uploads`). Dacă vrei
să le servești din MinIO — pornit deja de `docker compose` — lasă variabilele
`S3_*` completate în `.env`; driverul comută automat, iar consola MinIO e la
[localhost:9001](http://localhost:9001).

---

## 🔒 Securitate

- **Autorizare pe server** pentru fiecare pagină de admin, server action și rută
  de API (`requireStaff` / `requireAdmin`), cu rolul citit din baza de date, nu
  din token — un rol revocat pierde accesul imediat.
- **Izolare între magazine**: fiecare interogare de business filtrează pe
  `storeId`, iar comenzile se leagă de proprietar prin cookie httpOnly sau cont,
  niciodată prin numărul comenzii.
- **Validare** cu Zod pe intrări, plus validarea semantică a motorului pentru
  reguli (operatori compatibili cu tipul faptului, parametri în interval).
  Regulile sunt date structurate, niciodată cod executabil.
- **Rate limiting** pe login (anti brute-force), checkout, verificarea codului de
  comandă și pe apelurile AI (ține cota cheii Gemini sub control).
- **Headere**: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`; fără `X-Powered-By`.
- **Încărcări de imagini** validate prin magic bytes, cu SVG respins intenționat
  (vector XSS); cheile sunt generate de server, căile cu `..` refuzate, iar
  fișierele se servesc prin rută proprie cu `nosniff`.
- **Secrete** doar în variabile de mediu (`.env` este în `.gitignore`), parole de
  staff ca hash bcrypt, iar erorile interne nu ajung în răspunsuri.
- `npm audit` raportează **0 vulnerabilități**; patch-urile dependențelor
  tranzitive sunt fixate prin `overrides` în `package.json`.

Limitări asumate: nu există CSP strict (Next injectează scripturi inline care ar
cere nonce per cerere), limitarea de rată este _fail-open_ (dacă Redis cade,
cererile trec — protecția nu trebuie să devină ea însăși cauza
indisponibilității), iar plata este simulată.

---

## 🩺 Troubleshooting

| ⚠️ Problemă                                                               | 🛠️ Soluție                                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 🚫 **`Transactions are not supported` / checkout-ul eșuează**             | Baza de date nu e replica set — pornește-o cu `docker compose up -d`, nu un `mongod` separat.           |
| 🏪 **`Niciun magazin configurat`**                                        | Rulează `npm run db:seed`.                                                                              |
| 🔐 **Login-ul de admin eșuează fără mesaj**                               | Lipsește `AUTH_SECRET` din `.env`. În spatele unui reverse proxy e nevoie și de `AUTH_TRUST_HOST=true`. |
| ⛔ **„Prea multe încercări"** la login sau checkout                       | Limitarea de rată; așteaptă fereastra (10 min la login, 1 min la checkout) sau golește cheia din Redis. |
| 🪟 **`EPERM: operation not permitted ... query_engine-windows.dll.node`** | Oprește `npm run dev`, apoi rulează `npm run db:push` sau `npm run db:generate`.                        |
| 🤖 **`Gemini a răspuns cu 404 ... no longer available`**                  | Elimină `GEMINI_MODEL`; implicit se folosește `gemini-flash-latest`.                                    |
| 🔑 **Funcțiile AI sunt ascunse în interfață**                             | Configurează `GEMINI_API_KEY`.                                                                          |
| ⏳ **„Limita de cereri AI pe oră a fost atinsă”**                         | Așteaptă sau mărește limitele din `assertAiQuota` (`lib/ai/gemini.ts`).                                 |
| 🐢 **Prima încărcare a unei pagini e lentă în `dev`**                     | Normal: Next compilează ruta la prima cerere. În `npm start` nu se întâmplă.                            |
| 🖼️ **Imaginile încărcate nu apar**                                        | Verifică `S3_*` în `.env` (MinIO pornit?) sau șterge-le ca să folosești discul local.                   |

---

## 📚 Documentație

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — straturile aplicației, modelul
  regulilor și ciclul lor de viață, multi-tenancy
- [`docs/AI.md`](docs/AI.md) — modulul AI, garanțiile lui și serverul MCP
