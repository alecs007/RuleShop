/**
 * Date demonstrative: doua magazine independente (izolare multi-tenant),
 * fiecare cu propriul catalog si propriul set de reguli publicate.
 * Scriptul este idempotent (upsert).
 */
import { PrismaClient } from "@prisma/client";
import { provisionStarterRulesets } from "../lib/rules/provision";
import type { StoreRuleOptions } from "../lib/rules/starter-rules";

const prisma = new PrismaClient();

const img = (seed: string) => `https://picsum.photos/seed/${seed}/900/900`;

interface SeedProduct {
  sku: string;
  name: string;
  category: string;
  brand: string;
  priceCents: number;
  stock: number;
  description: string;
  /** Greutatea de livrare — faptul `cart.weightGrams` din regulile de livrare. */
  weightGrams: number;
  tags?: string[];
}

/**
 * Metodele de livrare, ca setari de magazin: fiecare magazin are lista lui, iar
 * costul final il decide rulesetul SHIPPING la runtime. Cele doua magazine au
 * intentionat liste diferite — izolarea multi-tenant se vede si aici.
 */
const roShippingMethods = [
  { id: "curier-standard", label: "Curier standard", costCents: 1999, etaDaysMin: 2, etaDaysMax: 4, sortOrder: 1 },
  { id: "curier-express", label: "Curier express", costCents: 3499, etaDaysMin: 1, etaDaysMax: 2, sortOrder: 2 },
  { id: "easybox", label: "Ridicare din easybox", costCents: 1499, etaDaysMin: 2, etaDaysMax: 5, sortOrder: 3 },
  { id: "ridicare-magazin", label: "Ridicare din magazin", costCents: 0, etaDaysMin: 0, etaDaysMax: 1, sortOrder: 4 },
];

const deShippingMethods = [
  { id: "dhl-paket", label: "DHL Paket", costCents: 495, etaDaysMin: 2, etaDaysMax: 3, sortOrder: 1 },
  { id: "dhl-express", label: "DHL Express", costCents: 1290, etaDaysMin: 1, etaDaysMax: 1, sortOrder: 2 },
  { id: "packstation", label: "Packstation", costCents: 395, etaDaysMin: 2, etaDaysMax: 4, sortOrder: 3 },
];

const roProducts: SeedProduct[] = [
  // audio
  { sku: "AUD-001", name: "Căști wireless Aria X2", category: "audio", brand: "Aria", priceCents: 34900, stock: 42, weightGrams: 320, description: "Căști over-ear cu anulare activă a zgomotului, autonomie de 40 de ore și încărcare rapidă USB-C.", tags: ["wireless", "noise-cancelling"] },
  { sku: "AUD-002", name: "Boxă portabilă Wave Mini", category: "audio", brand: "Wave", priceCents: 19900, stock: 65, weightGrams: 580, description: "Boxă bluetooth compactă, rezistentă la apă IPX7, 12 ore de redare.", tags: ["bluetooth", "portabil"] },
  { sku: "AUD-003", name: "Căști in-ear Pulse Buds Pro", category: "audio", brand: "Pulse", priceCents: 24900, stock: 4, weightGrams: 60, description: "True wireless cu ANC hibrid, două microfoane per cască și carcasă cu încărcare wireless.", tags: ["wireless"] },
  // laptopuri
  { sku: "LAP-001", name: "Laptop Nova Air 14", category: "laptopuri", brand: "Nova", priceCents: 429900, stock: 12, weightGrams: 1200, description: "Ultraportabil de 14\", 1.2 kg, ecran 2.8K 90 Hz, 16 GB RAM și SSD de 1 TB.", tags: ["ultraportabil"] },
  { sku: "LAP-002", name: "Laptop Nova Pro 16", category: "laptopuri", brand: "Nova", priceCents: 689900, stock: 7, weightGrams: 2100, description: "Stație de lucru mobilă cu ecran 16\" 120 Hz, GPU dedicat și răcire cu două ventilatoare.", tags: ["performanta"] },
  { sku: "LAP-003", name: "Laptop Atlas Studio 15", category: "laptopuri", brand: "Atlas", priceCents: 549900, stock: 0, weightGrams: 1800, description: "Pentru creatori de conținut: ecran OLED calibrat, 32 GB RAM, SSD 2 TB.", tags: ["creator", "oled"] },
  // telefoane
  { sku: "TEL-001", name: "Telefon Vertex 9", category: "telefoane", brand: "Vertex", priceCents: 399900, stock: 25, weightGrams: 195, description: "Ecran AMOLED 6.4\" 120 Hz, cameră principală de 50 MP cu stabilizare optică, baterie de 5000 mAh.", tags: ["5g"] },
  { sku: "TEL-002", name: "Telefon Vertex 9 Pro", category: "telefoane", brand: "Vertex", priceCents: 549900, stock: 18, weightGrams: 210, description: "Varianta Pro cu teleobiectiv periscop 5x, încărcare 80W și certificare IP68.", tags: ["5g", "flagship"] },
  { sku: "TEL-003", name: "Telefon Mono Lite", category: "telefoane", brand: "Mono", priceCents: 149900, stock: 50, weightGrams: 180, description: "Esențialul făcut bine: ecran de 6.1\", două zile de autonomie, Android curat.", tags: ["buget"] },
  // accesorii
  { sku: "ACC-001", name: "Încărcător GaN 65W", category: "accesorii", brand: "Volt", priceCents: 12900, stock: 80, weightGrams: 120, description: "Încărcător compact GaN cu 2×USB-C și 1×USB-A, putere totală de 65W.", tags: ["usb-c"] },
  { sku: "ACC-002", name: "Mouse ergonomic Drift", category: "accesorii", brand: "Drift", priceCents: 15900, stock: 35, weightGrams: 95, description: "Mouse vertical wireless cu senzor de 4000 DPI și click-uri silențioase.", tags: ["ergonomic", "wireless"] },
  { sku: "ACC-003", name: "Tastatură mecanică Keystone 75", category: "accesorii", brand: "Keystone", priceCents: 44900, stock: 22, weightGrams: 850, description: "Layout 75%, switch-uri hot-swap, iluminare RGB per tastă, carcasă din aluminiu.", tags: ["mecanica", "rgb"] },
  { sku: "ACC-004", name: "Hub USB-C 8-in-1", category: "accesorii", brand: "Volt", priceCents: 18900, stock: 3, weightGrams: 75, description: "HDMI 4K60, 2×USB 3.2, cititor SD/microSD, Ethernet gigabit și Power Delivery 100W.", tags: ["usb-c"] },
  // gaming
  { sku: "GAM-001", name: "Controller Nimbus Pro", category: "gaming", brand: "Nimbus", priceCents: 27900, stock: 30, weightGrams: 280, description: "Controller wireless cu trigger-e adaptive, butoane spate programabile și autonomie de 30 de ore.", tags: ["wireless"] },
  { sku: "GAM-002", name: "Monitor gaming Prism 27", category: "gaming", brand: "Prism", priceCents: 179900, stock: 9, weightGrams: 6400, description: "27\" QHD, 165 Hz, 1 ms, HDR400 și suport cu reglaj complet pe înălțime.", tags: ["165hz", "qhd"] },
  { sku: "GAM-003", name: "Scaun gaming Throne S", category: "gaming", brand: "Throne", priceCents: 129900, stock: 6, weightGrams: 21500, description: "Spătar reglabil 165°, suport lombar magnetic, tapițerie textilă respirabilă.", tags: ["ergonomic"] },
];

const deProducts: SeedProduct[] = [
  { sku: "DE-AUD-001", name: "Kopfhörer Klang One", category: "audio", brand: "Klang", priceCents: 29900, stock: 20, weightGrams: 300, description: "Over-Ear-Kopfhörer mit aktiver Geräuschunterdrückung und 35 Stunden Akkulaufzeit.", tags: ["wireless"] },
  { sku: "DE-LAP-001", name: "Laptop Berg Book 13", category: "laptopuri", brand: "Berg", priceCents: 389900, stock: 10, weightGrams: 1100, description: "Kompaktes 13-Zoll-Notebook mit 16 GB RAM und 512 GB SSD.", tags: ["ultraportabil"] },
  { sku: "DE-ACC-001", name: "Ladegerät Blitz 45W", category: "accesorii", brand: "Blitz", priceCents: 9900, stock: 40, weightGrams: 90, description: "Kompaktes GaN-Ladegerät mit USB-C Power Delivery.", tags: ["usb-c"] },
];


async function seedStore(
  slug: string,
  name: string,
  currency: string,
  locale: string,
  products: SeedProduct[],
  shippingMethods: (typeof roShippingMethods)[number][],
  ruleOptions: StoreRuleOptions,
) {
  const settings = { shippingMethods };
  const store = await prisma.store.upsert({
    where: { slug },
    create: { slug, name, currency, locale, settings },
    update: { name, currency, locale, settings },
  });

  for (const p of products) {
    const slugified = p.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    await prisma.product.upsert({
      where: { storeId_sku: { storeId: store.id, sku: p.sku } },
      create: {
        storeId: store.id,
        sku: p.sku,
        slug: slugified,
        name: p.name,
        description: p.description,
        category: p.category,
        brand: p.brand,
        basePriceCents: p.priceCents,
        currency,
        stock: p.stock,
        weightGrams: p.weightGrams,
        tags: p.tags ?? [],
        imageUrls: [img(p.sku)],
      },
      update: {
        name: p.name,
        description: p.description,
        category: p.category,
        brand: p.brand,
        basePriceCents: p.priceCents,
        stock: p.stock,
        weightGrams: p.weightGrams,
        tags: p.tags ?? [],
        imageUrls: [img(p.sku)],
      },
    });
  }

  const rules = await provisionStarterRulesets({
    db: prisma,
    storeId: store.id,
    options: ruleOptions,
    changeSummary: "Reguli demonstrative de start (seed).",
  });

  console.log(
    `✔ ${name} (${slug}): ${products.length} produse, ${shippingMethods.length} metode de livrare, ` +
      `${rules.categories} categorii de reguli` +
      (rules.published > 0
        ? ` (${rules.published} publicate acum)`
        : " (deja la zi)"),
  );
  return store;
}

async function main() {
  await seedStore(
    "ruleshop-ro",
    "RuleShop",
    "RON",
    "ro-RO",
    roProducts,
    roShippingMethods,
    {
      shipping: { express: "curier-express", locker: "easybox" },
      theme: { hex: "#2563eb", ink: "#1d4ed8", countryCode: "RO" },
    },
  );
  await seedStore(
    "ruleshop-de",
    "RuleShop DE",
    "EUR",
    "de-DE",
    deProducts,
    deShippingMethods,
    {
      shipping: { express: "dhl-express", locker: "packstation" },
      // Alt accent pentru magazinul german: aceeasi platforma, alta identitate.
      theme: { hex: "#0f766e", ink: "#115e59", countryCode: "DE" },
    },
  );

  // Clientii au nevoie de un magazin activ. Un re-seed NU il schimba:
  // administratorul poate fi mutat magazinul activ din panou, iar seed-ul nu are
  // ce sa corecteze acolo.
  const withDefault = await prisma.store.count({ where: { isDefault: true } });
  if (withDefault === 0) {
    const store = await prisma.store.update({
      where: { slug: "ruleshop-ro" },
      data: { isDefault: true },
    });
    console.log(`✔ magazin activ (cel văzut de clienți): ${store.slug}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
