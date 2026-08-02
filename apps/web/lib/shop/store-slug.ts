import { z } from "zod";

/**
 * A store's slug: the stable identifier used in URLs, scripts and environment
 * variables. Pure, so the new-store form can propose one on the client.
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

/** "RuleShop Deutschland" -> "ruleshop-deutschland". */
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
