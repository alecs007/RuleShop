/**
 * Server actions get no route params, so every storefront form sends the store
 * prefix itself. Without it an order placed from `/de` would land in the main
 * store.
 */
export function StorePrefixField({ prefix }: { prefix: string | null }) {
  return <input type="hidden" name="storePrefix" value={prefix ?? ""} />;
}
