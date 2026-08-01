/**
 * Aritmetica deciziei de PRICING — modul PUR, fara DB si fara server-only,
 * ca acelasi calcul sa ruleze identic in magazin, in testerul din control
 * plane si in simularea pe evenimente istorice.
 */

/** Aplica decizia PRICING peste pretul de baza, cu clamp la [0, base*10]. */
export function applyPricingDecision(
  baseCents: number,
  decision: Record<string, unknown>,
): number {
  const override = decision.priceOverrideCents;
  if (typeof override === "number" && override >= 0) return Math.round(override);

  let final = baseCents;
  if (typeof decision.priceMultiplier === "number" && decision.priceMultiplier >= 0) {
    final *= decision.priceMultiplier;
  }
  if (typeof decision.discountPercent === "number") {
    final -= (final * Math.min(100, Math.max(0, decision.discountPercent))) / 100;
  }
  if (typeof decision.discountFixedCents === "number") {
    final -= Math.max(0, decision.discountFixedCents);
  }
  return Math.max(0, Math.min(Math.round(final), baseCents * 10));
}
