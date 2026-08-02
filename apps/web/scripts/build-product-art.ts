/**
 * Rasterizes the illustrations from `product-art.ts`. Run by hand, not on every
 * build: the results are versioned, so a fresh clone has the images without
 * depending on sharp.
 */
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ART } from "./product-art";

/**
 * sharp arrives as a transitive dependency of Next, so its types are not
 * resolvable here; only the methods used are described.
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
