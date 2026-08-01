/**
 * Validarea fișierelor încărcate. Modul PUR — fără acces la rețea sau disc,
 * deci se poate testa direct.
 *
 * Principiul: nimic din ce spune clientul nu se crede. Numele fișierului nu
 * ajunge niciodată în cheia obiectului (o generăm noi), iar tipul se stabilește
 * din primii bytes ai conținutului, nu din `Content-Type`-ul trimis de browser.
 */

/**
 * Formatele acceptate. SVG lipsește intenționat: e un document XML care poate
 * purta `<script>`, deci servit de pe domeniul nostru ar fi un vector XSS.
 */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/** Limite per cerere — un client nu poate cere aplicației memorie nelimitată. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 8;
/** Sub atât nu există imagine validă; e un fișier gol sau trunchiat. */
const MIN_FILE_BYTES = 64;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

/**
 * Tipul real al fișierului, după semnătura din conținut (magic bytes).
 * Întoarce null pentru orice altceva — inclusiv pentru SVG, HTML sau arhive
 * redenumite în `.png`.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (bytes.length >= 6) {
    const header = ascii(bytes, 0, 6);
    if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  // Cutie ISO-BMFF: ....ftyp<brand>
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

/** `image/jpg` si parametrii de charset sunt frecvente în browsere. */
function normalizeDeclaredType(declared: string): string {
  const base = declared.split(";")[0]!.trim().toLowerCase();
  return base === "image/jpg" ? "image/jpeg" : base;
}

export type ImageValidation =
  | { ok: true; type: AllowedImageType; extension: string }
  | { ok: false; error: string };

const ACCEPTED_LABEL = "JPEG, PNG, WebP, AVIF sau GIF";

/** Validează un singur fișier: dimensiune, semnătură și acordul cu tipul declarat. */
export function validateImage(input: {
  size: number;
  declaredType?: string;
  bytes: Uint8Array;
}): ImageValidation {
  if (input.size > MAX_FILE_BYTES) {
    const limit = Math.round(MAX_FILE_BYTES / (1024 * 1024));
    return { ok: false, error: `Fișierul depășește ${limit} MB.` };
  }
  if (input.size < MIN_FILE_BYTES || input.bytes.length < MIN_FILE_BYTES) {
    return { ok: false, error: "Fișierul este gol sau deteriorat." };
  }

  const sniffed = sniffImageType(input.bytes);
  if (!sniffed) {
    return { ok: false, error: `Format neacceptat — folosește ${ACCEPTED_LABEL}.` };
  }

  // Nepotrivirea dintre conținut si tipul declarat e semn de fișier mascat.
  const declared = input.declaredType ? normalizeDeclaredType(input.declaredType) : "";
  if (
    declared &&
    declared !== "application/octet-stream" &&
    declared !== sniffed
  ) {
    return {
      ok: false,
      error: "Conținutul fișierului nu corespunde tipului declarat.",
    };
  }

  return { ok: true, type: sniffed, extension: EXTENSION_BY_TYPE[sniffed] };
}

/**
 * Cheia obiectului în bucket. Compusă exclusiv din valori pe care le controlăm
 * (magazin, dată, UUID) — numele venit de la client nu apare deloc, deci nu
 * există cale de traversare (`../`) sau coliziune de nume.
 */
export function buildObjectKey(input: {
  storeId: string;
  extension: string;
  uuid: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const store = input.storeId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `${store}/${now.getUTCFullYear()}/${month}/${input.uuid}.${input.extension}`;
}

const KEY_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\/[a-zA-Z0-9_-]+)*\.(?:jpg|jpeg|png|webp|avif|gif)$/;

/**
 * Poarta pentru cheile venite din exterior (servire, ștergere): fără `..`,
 * fără cale absolută, fără caractere speciale, cu extensie din listă.
 */
export function isValidObjectKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 200 &&
    !key.includes("..") &&
    KEY_PATTERN.test(key)
  );
}

/** Tipul de conținut cu care se servește o cheie, după extensie. */
export function contentTypeForKey(key: string): AllowedImageType | null {
  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  const found = Object.entries(EXTENSION_BY_TYPE).find(
    ([, ext]) => ext === (extension === "jpeg" ? "jpg" : extension),
  );
  return (found?.[0] as AllowedImageType) ?? null;
}
