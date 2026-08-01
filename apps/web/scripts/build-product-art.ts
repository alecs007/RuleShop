/**
 * Rasterizează ilustrațiile din `product-art.ts` în `public/images/products/`.
 *
 * Se rulează manual (`pnpm product-art`), nu la fiecare build: rezultatele sunt
 * versionate, deci un clone proaspăt are imaginile fără să depindă de sharp.
 */
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ART } from "./product-art";

/**
 * sharp ajunge aici ca dependință tranzitivă a lui Next, deci nu are tipuri
 * rezolvabile din acest pachet. Descriem doar metodele folosite.
 */
interface SharpPipeline {
  resize(w: number, h: number, opts: { fit: string; background: string }): SharpPipeline;
  flatten(opts: { background: string }): SharpPipeline;
  png(opts: { compressionLevel: number; palette: boolean }): SharpPipeline;
  toBuffer(): Promise<Buffer>;
}
type SharpFactory = (input: Buffer, opts?: { density?: number }) => SharpPipeline;

const require = createRequire(import.meta.url);
const sharp = require("sharp") as SharpFactory;

const OUT_DIR = path.join(process.cwd(), "public", "images", "products");
const SIZE = 900;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const names = Object.keys(ART).sort();
  for (const name of names) {
    const svg = ART[name];
    if (!svg) continue;

    const file = path.join(OUT_DIR, `${name}.png`);
    const png = await sharp(Buffer.from(svg), { density: 144 })
      .resize(SIZE, SIZE, { fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();

    await writeFile(file, png);
    console.log(`  ${name}.png  ${(png.length / 1024).toFixed(1)} KB`);
  }

  console.log(`\n${names.length} ilustrații în ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
