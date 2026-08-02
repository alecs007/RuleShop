/**
 * Confirmations that must survive a navigation. An action ending in
 * `redirect()` cannot show a toast itself — the component that started it is
 * gone — so it puts a key in the URL and `flash-toast.tsx` turns it into a
 * toast on load. Keys only, never free text: the message comes from the
 * registry here, so nothing can be injected through the query string.
 */

export const FLASH_PARAM = "flash";

export type FlashTone = "success" | "info" | "error";

export interface FlashMessage {
  tone: FlashTone;
  message: string;
  description?: string;
}

export const FLASH_MESSAGES = {
  "signed-in": { tone: "success", message: "Bine ai venit!" },
  "signed-out": { tone: "info", message: "Te-ai deconectat." },
  "admin-signed-in": {
    tone: "success",
    message: "Autentificare reușită",
    description: "Ai acces la panoul de control.",
  },
  "cart-item-removed": { tone: "info", message: "Produs șters din coș." },
  "product-created": { tone: "success", message: "Produsul a fost creat." },
  "product-updated": { tone: "success", message: "Modificările au fost salvate." },
} satisfies Record<string, FlashMessage>;

export type FlashKey = keyof typeof FLASH_MESSAGES;

export function isFlashKey(value: unknown): value is FlashKey {
  return typeof value === "string" && value in FLASH_MESSAGES;
}

/** Typed accessor: `satisfies` keeps the keys but narrows the values too far. */
export function flashMessage(key: FlashKey): FlashMessage {
  return FLASH_MESSAGES[key];
}

/** The `http://flash.local` base only makes `URL` accept relative paths. */
export function withFlash(path: string, key: FlashKey): string {
  const url = new URL(path, "http://flash.local");
  url.searchParams.set(FLASH_PARAM, key);
  return `${url.pathname}${url.search}${url.hash}`;
}
