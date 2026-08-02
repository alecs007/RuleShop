/**
 * Upload validation. Nothing the client says is trusted: the filename never
 * reaches the object key, and the type comes from the content's first bytes,
 * not from the browser's `Content-Type`.
 */

/**
 * SVG is left out on purpose: it is an XML document that can carry `<script>`,
 * so serving one from our own domain would be an XSS vector.
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

/** Per-request limits, so a client cannot ask the app for unbounded memory. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 8;
/** Below this there is no valid image, only an empty or truncated file. */
const MIN_FILE_BYTES = 64;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

/** The real type, from the magic bytes. Anything else, renamed or not, is null. */
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

/** `image/jpg` and charset parameters are common in browsers. */
function normalizeDeclaredType(declared: string): string {
  const base = declared.split(";")[0]!.trim().toLowerCase();
  return base === "image/jpg" ? "image/jpeg" : base;
}

export type ImageValidation =
  | { ok: true; type: AllowedImageType; extension: string }
  | { ok: false; error: string };

const ACCEPTED_LABEL = "JPEG, PNG, WebP, AVIF sau GIF";

/** Checks size, signature, and that they agree with the declared type. */
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

  // Content that disagrees with the declared type suggests a disguised file.
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
 * Built only from values we control (store, date, UUID). The client's filename
 * appears nowhere, so there is no path traversal and no name collision.
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

/** Gate for keys arriving from outside: no `..`, no absolute paths, known extension. */
export function isValidObjectKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 200 &&
    !key.includes("..") &&
    KEY_PATTERN.test(key)
  );
}

/** The content type a key is served with, by extension. */
export function contentTypeForKey(key: string): AllowedImageType | null {
  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  const found = Object.entries(EXTENSION_BY_TYPE).find(
    ([, ext]) => ext === (extension === "jpeg" ? "jpg" : extension),
  );
  return (found?.[0] as AllowedImageType) ?? null;
}
