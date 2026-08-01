import { describe, expect, it } from "vitest";
import {
  buildObjectKey,
  contentTypeForKey,
  isValidObjectKey,
  MAX_FILE_BYTES,
  sniffImageType,
  validateImage,
} from "@/lib/storage/validate";

/** Fișier de test: semnătura reală + umplutură până la o dimensiune plauzibilă. */
function file(signature: number[], size = 1024): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(signature, 0);
  return bytes;
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF = [...Buffer.from("GIF89a")];

function riff(fourcc: string): number[] {
  return [
    ...Buffer.from("RIFF"),
    0, 0, 0, 0,
    ...Buffer.from(fourcc),
  ];
}

function ftyp(brand: string): number[] {
  return [0, 0, 0, 0x20, ...Buffer.from("ftyp"), ...Buffer.from(brand)];
}

describe("sniffImageType — semnătura din conținut", () => {
  it("recunoaște formatele acceptate", () => {
    expect(sniffImageType(file(JPEG))).toBe("image/jpeg");
    expect(sniffImageType(file(PNG))).toBe("image/png");
    expect(sniffImageType(file(GIF))).toBe("image/gif");
    expect(sniffImageType(file(riff("WEBP")))).toBe("image/webp");
    expect(sniffImageType(file(ftyp("avif")))).toBe("image/avif");
  });

  it("respinge SVG — ar putea conține script", () => {
    const svg = new Uint8Array(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
    );
    expect(sniffImageType(svg)).toBeNull();
  });

  it("respinge HTML, arhive si RIFF care nu e WebP", () => {
    expect(sniffImageType(new Uint8Array(Buffer.from("<!DOCTYPE html>")))).toBeNull();
    expect(sniffImageType(file([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // zip
    expect(sniffImageType(file(riff("WAVE")))).toBeNull();
  });

  it("nu se lasă păcălit de fișiere prea scurte", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("validateImage", () => {
  it("acceptă o imagine validă si întoarce extensia", () => {
    const result = validateImage({
      size: 1024,
      declaredType: "image/png",
      bytes: file(PNG),
    });
    expect(result).toEqual({ ok: true, type: "image/png", extension: "png" });
  });

  it("acceptă `image/jpg` si tipul lipsă (browsere inconsecvente)", () => {
    expect(
      validateImage({ size: 1024, declaredType: "image/jpg", bytes: file(JPEG) }).ok,
    ).toBe(true);
    expect(validateImage({ size: 1024, bytes: file(JPEG) }).ok).toBe(true);
    expect(
      validateImage({
        size: 1024,
        declaredType: "application/octet-stream",
        bytes: file(JPEG),
      }).ok,
    ).toBe(true);
  });

  it("respinge un executabil redenumit în .png", () => {
    const result = validateImage({
      size: 1024,
      declaredType: "image/png",
      bytes: file([0x4d, 0x5a, 0x90, 0x00]), // MZ
    });
    expect(result.ok).toBe(false);
  });

  it("respinge nepotrivirea dintre conținut si tipul declarat", () => {
    const result = validateImage({
      size: 1024,
      declaredType: "image/png",
      bytes: file(JPEG),
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("nu corespunde");
  });

  it("respinge fișierele peste limită si pe cele goale", () => {
    expect(
      validateImage({
        size: MAX_FILE_BYTES + 1,
        declaredType: "image/png",
        bytes: file(PNG),
      }).ok,
    ).toBe(false);
    expect(
      validateImage({ size: 10, declaredType: "image/png", bytes: file(PNG, 10) }).ok,
    ).toBe(false);
  });
});

describe("chei de obiect", () => {
  it("cheia se compune doar din valori controlate de server", () => {
    const key = buildObjectKey({
      storeId: "store123",
      extension: "webp",
      uuid: "11111111-2222-3333-4444-555555555555",
      now: new Date("2026-07-30T00:00:00Z"),
    });
    expect(key).toBe(
      "store123/2026/07/11111111-2222-3333-4444-555555555555.webp",
    );
    expect(isValidObjectKey(key)).toBe(true);
  });

  it("ignoră caracterele periculoase din id-ul magazinului", () => {
    const key = buildObjectKey({
      storeId: "../../etc",
      extension: "png",
      uuid: "abc",
    });
    expect(key.startsWith("etc/")).toBe(true);
    expect(key).not.toContain("..");
  });

  it("respinge cheile care ar ieși din bucket sau nu sunt imagini", () => {
    expect(isValidObjectKey("../../etc/passwd.png")).toBe(false);
    expect(isValidObjectKey("/absolut/cale.png")).toBe(false);
    expect(isValidObjectKey("store/imagine.svg")).toBe(false);
    expect(isValidObjectKey("store/script.js")).toBe(false);
    expect(isValidObjectKey("store/fara-extensie")).toBe(false);
    expect(isValidObjectKey("store/spa tiu.png")).toBe(false);
    expect(isValidObjectKey(`store/${"x".repeat(300)}.png`)).toBe(false);
    expect(isValidObjectKey("")).toBe(false);
  });

  it("tipul de servire vine din extensia validată", () => {
    expect(contentTypeForKey("s/2026/07/a.jpg")).toBe("image/jpeg");
    expect(contentTypeForKey("s/2026/07/a.jpeg")).toBe("image/jpeg");
    expect(contentTypeForKey("s/2026/07/a.webp")).toBe("image/webp");
    expect(contentTypeForKey("s/2026/07/a.svg")).toBeNull();
  });
});
