export function formatMoney(
  cents: number,
  currency = "RON",
  locale = "ro-RO",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
