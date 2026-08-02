/**
 * Path-prefix routing: the main store at the root (`/products`), the others
 * under their prefix (`/de/products`). Pure, so the middleware can use it
 * where there is no database access.
 */

/**
 * The main store's internal segment. It never appears in a customer's address
 * bar: the middleware rewrites `/products` to `/__main/products`.
 */
export const MAIN_STORE_SEGMENT = "__main";

/**
 * Top-level segments that belong to the app, not to a store. The middleware
 * cannot ask the database which prefixes exist, and does not need to: the
 * first segment is a store prefix exactly when it is not one of these. Adding
 * a store therefore needs no deploy; adding a top-level route does.
 */
export const RESERVED_SEGMENTS = new Set([
  "products",
  "cart",
  "checkout",
  "orders",
  "account",
  "auth",
  "admin",
  "api",
  "images",
  "icon",
  "_next",
]);

/** A valid store prefix: short kebab-case that does not shadow a route. */
export function isValidPathPrefix(prefix: string): boolean {
  return /^[a-z][a-z0-9-]{0,30}$/.test(prefix) && !RESERVED_SEGMENTS.has(prefix);
}

/** No prefix means the first segment belongs to the app: the main store. */
export function splitStorePath(pathname: string): {
  prefix: string | null;
  rest: string;
} {
  const [, first = "", ...others] = pathname.split("/");
  if (first === "" || RESERVED_SEGMENTS.has(first)) {
    return { prefix: null, rest: pathname };
  }
  return { prefix: first, rest: `/${others.join("/")}` };
}

/** The `[store]` segment for a path: its prefix, or the main-store marker. */
export function storeSegmentFor(pathname: string): string {
  return splitStorePath(pathname).prefix ?? MAIN_STORE_SEGMENT;
}

/**
 * Every storefront link goes through this: otherwise a link inside `/de` would
 * send the customer to the main store.
 */
export function storeHref(prefix: string | null, path = "/"): string {
  const clean = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  if (!prefix) return clean || "/";
  return `/${prefix}${clean}`;
}
