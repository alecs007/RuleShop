/**
 * Mesaje „flash”: confirmări care trebuie să supraviețuiască unei navigări.
 *
 * Un server action care se termină cu `redirect()` (sau un `signIn`/`signOut`
 * care reîncarcă pagina) nu poate afișa el însuși un toast — componenta care
 * l-a pornit nu mai există. Așa că acțiunea pune o cheie în URL
 * (`?flash=signed-in`), iar `components/ui/flash-toast.tsx` o transformă în
 * toast la încărcare și curăță parametrul.
 *
 * Doar chei, niciodată text liber în URL: mesajul vine din registrul de aici,
 * deci nimeni nu poate injecta conținut prin query string.
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

/** Accesor tipizat: `satisfies` păstrează cheile, dar îngustează prea mult valorile. */
export function flashMessage(key: FlashKey): FlashMessage {
  return FLASH_MESSAGES[key];
}

/**
 * Adaugă cheia de flash la o adresă internă, păstrând parametrii existenți.
 * Baza `http://flash.local` e doar un artificiu ca `URL` să accepte căi
 * relative; nu ajunge niciodată în rezultat.
 */
export function withFlash(path: string, key: FlashKey): string {
  const url = new URL(path, "http://flash.local");
  url.searchParams.set(FLASH_PARAM, key);
  return `${url.pathname}${url.search}${url.hash}`;
}
