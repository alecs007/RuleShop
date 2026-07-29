/**
 * Date demonstrative: doua magazine independente (izolare multi-tenant),
 * fiecare cu propriul catalog. Scriptul este idempotent (upsert).
 */
import { PrismaClient } from "@prisma/client";

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
  tags?: string[];
}

const roProducts: SeedProduct[] = [
  // audio
  { sku: "AUD-001", name: "Casti wireless Aria X2", category: "audio", brand: "Aria", priceCents: 34900, stock: 42, description: "Casti over-ear cu anulare activa a zgomotului, autonomie 40 de ore si incarcare rapida USB-C.", tags: ["wireless", "noise-cancelling"] },
  { sku: "AUD-002", name: "Boxa portabila Wave Mini", category: "audio", brand: "Wave", priceCents: 19900, stock: 65, description: "Boxa bluetooth compacta, rezistenta la apa IPX7, 12 ore de redare.", tags: ["bluetooth", "portabil"] },
  { sku: "AUD-003", name: "Casti in-ear Pulse Buds Pro", category: "audio", brand: "Pulse", priceCents: 24900, stock: 4, description: "True wireless cu ANC hibrid, doua microfoane per casca si carcasa cu incarcare wireless.", tags: ["wireless"] },
  // laptopuri
  { sku: "LAP-001", name: "Laptop Nova Air 14", category: "laptopuri", brand: "Nova", priceCents: 429900, stock: 12, description: "Ultraportabil de 14\", 1.2 kg, ecran 2.8K 90 Hz, 16 GB RAM si SSD de 1 TB.", tags: ["ultraportabil"] },
  { sku: "LAP-002", name: "Laptop Nova Pro 16", category: "laptopuri", brand: "Nova", priceCents: 689900, stock: 7, description: "Statie de lucru mobila cu ecran 16\" 120 Hz, GPU dedicat si racire cu doua ventilatoare.", tags: ["performanta"] },
  { sku: "LAP-003", name: "Laptop Atlas Studio 15", category: "laptopuri", brand: "Atlas", priceCents: 549900, stock: 0, description: "Pentru creatori de continut: ecran OLED calibrat, 32 GB RAM, SSD 2 TB.", tags: ["creator", "oled"] },
  // telefoane
  { sku: "TEL-001", name: "Telefon Vertex 9", category: "telefoane", brand: "Vertex", priceCents: 399900, stock: 25, description: "Ecran AMOLED 6.4\" 120 Hz, camera principala de 50 MP cu stabilizare optica, baterie 5000 mAh.", tags: ["5g"] },
  { sku: "TEL-002", name: "Telefon Vertex 9 Pro", category: "telefoane", brand: "Vertex", priceCents: 549900, stock: 18, description: "Varianta Pro cu teleobiectiv periscop 5x, incarcare 80W si certificare IP68.", tags: ["5g", "flagship"] },
  { sku: "TEL-003", name: "Telefon Mono Lite", category: "telefoane", brand: "Mono", priceCents: 149900, stock: 50, description: "Esentialul facut bine: ecran de 6.1\", doua zile de autonomie, Android curat.", tags: ["buget"] },
  // accesorii
  { sku: "ACC-001", name: "Incarcator GaN 65W", category: "accesorii", brand: "Volt", priceCents: 12900, stock: 80, description: "Incarcator compact GaN cu 2×USB-C si 1×USB-A, putere totala 65W.", tags: ["usb-c"] },
  { sku: "ACC-002", name: "Mouse ergonomic Drift", category: "accesorii", brand: "Drift", priceCents: 15900, stock: 35, description: "Mouse vertical wireless cu senzor de 4000 DPI si click-uri silentioase.", tags: ["ergonomic", "wireless"] },
  { sku: "ACC-003", name: "Tastatura mecanica Keystone 75", category: "accesorii", brand: "Keystone", priceCents: 44900, stock: 22, description: "Layout 75%, switch-uri hot-swap, iluminare RGB per tasta, carcasa din aluminiu.", tags: ["mecanica", "rgb"] },
  { sku: "ACC-004", name: "Hub USB-C 8-in-1", category: "accesorii", brand: "Volt", priceCents: 18900, stock: 3, description: "HDMI 4K60, 2×USB 3.2, cititor SD/microSD, Ethernet gigabit si Power Delivery 100W.", tags: ["usb-c"] },
  // gaming
  { sku: "GAM-001", name: "Controller Nimbus Pro", category: "gaming", brand: "Nimbus", priceCents: 27900, stock: 30, description: "Controller wireless cu trigger-e adaptive, butoane spate programabile si autonomie 30 de ore.", tags: ["wireless"] },
  { sku: "GAM-002", name: "Monitor gaming Prism 27", category: "gaming", brand: "Prism", priceCents: 179900, stock: 9, description: "27\" QHD, 165 Hz, 1 ms, HDR400 si suport cu reglaj complet pe inaltime.", tags: ["165hz", "qhd"] },
  { sku: "GAM-003", name: "Scaun gaming Throne S", category: "gaming", brand: "Throne", priceCents: 129900, stock: 6, description: "Spatar reglabil 165°, suport lombar magnetic, tapiterie textila respirabila.", tags: ["ergonomic"] },
];

const deProducts: SeedProduct[] = [
  { sku: "DE-AUD-001", name: "Kopfhorer Klang One", category: "audio", brand: "Klang", priceCents: 29900, stock: 20, description: "Over-Ear-Kopfhorer mit aktiver Gerauschunterdruckung und 35 Stunden Akkulaufzeit.", tags: ["wireless"] },
  { sku: "DE-LAP-001", name: "Laptop Berg Book 13", category: "laptopuri", brand: "Berg", priceCents: 389900, stock: 10, description: "Kompaktes 13-Zoll-Notebook mit 16 GB RAM und 512 GB SSD.", tags: ["ultraportabil"] },
  { sku: "DE-ACC-001", name: "Ladegerat Blitz 45W", category: "accesorii", brand: "Blitz", priceCents: 9900, stock: 40, description: "Kompaktes GaN-Ladegerat mit USB-C Power Delivery.", tags: ["usb-c"] },
];

async function seedStore(
  slug: string,
  name: string,
  currency: string,
  locale: string,
  products: SeedProduct[],
) {
  const store = await prisma.store.upsert({
    where: { slug },
    create: { slug, name, currency, locale },
    update: { name, currency, locale },
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
        tags: p.tags ?? [],
        imageUrls: [img(p.sku)],
      },
    });
  }

  console.log(`✔ ${name} (${slug}): ${products.length} produse`);
  return store;
}

async function main() {
  await seedStore("ruleshop-ro", "RuleShop", "RON", "ro-RO", roProducts);
  await seedStore("ruleshop-de", "RuleShop DE", "EUR", "de-DE", deProducts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
