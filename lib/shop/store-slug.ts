import { z } from "zod";

/**
 * Slug-ul unui magazin: identificatorul stabil din URL-uri, scripturi
 * (`create-admin --store`) si variabile de mediu. Pur, ca sa poata fi testat si
 * folosit si in client (formularul de magazin nou propune slug-ul din nume).
 */

export const STORE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const storeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    STORE_SLUG_PATTERN,
    "Slug: doar litere mici, cifre și cratime (ex: ruleshop-de), 3–40 caractere.",
  );

/** Slug propus dintr-un nume liber: „RuleShop Deutschland" → „ruleshop-deutschland". */
export function slugifyStoreName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
