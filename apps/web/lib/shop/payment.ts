/**
 * Payment is simulated, but behind a provider interface, so wiring up a real
 * processor means a new implementation and a change in `getPaymentProvider`,
 * not a change to the checkout flow.
 */

export const PAYMENT_METHODS = [
  { id: "card", label: "Card bancar (simulat)" },
  { id: "ramburs", label: "Ramburs la curier" },
  { id: "card-refuzat", label: "Card care va fi refuzat (pentru demo)" },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

export function isPaymentMethod(value: unknown): value is PaymentMethodId {
  return PAYMENT_METHODS.some((m) => m.id === value);
}

export function paymentMethodLabel(id: string): string {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label ?? id;
}

export interface PaymentIntent {
  orderNumber: string;
  amountCents: number;
  currency: string;
  method: PaymentMethodId;
}

export interface PaymentResult {
  ok: boolean;
  /** The transaction reference, kept on the order. */
  reference: string | null;
  /** Shown to the customer when the payment was declined. */
  message?: string;
  /** true for cash on delivery. */
  deferred?: boolean;
}

export interface PaymentProvider {
  id: string;
  authorize(intent: PaymentIntent): Promise<PaymentResult>;
}

function reference(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Authorizes instantly. The "declined card" method exists to exercise failures. */
export const simulatedPaymentProvider: PaymentProvider = {
  id: "simulated",
  async authorize(intent) {
    if (intent.method === "card-refuzat") {
      return {
        ok: false,
        reference: null,
        message: "Plata a fost refuzată de bancă. Încearcă altă metodă.",
      };
    }
    if (intent.amountCents <= 0) {
      return { ok: false, reference: null, message: "Sumă invalidă." };
    }
    if (intent.method === "ramburs") {
      return { ok: true, reference: reference("cod"), deferred: true };
    }
    return { ok: true, reference: reference("sim") };
  },
};

export function getPaymentProvider(): PaymentProvider {
  // A real provider would be selected here once keys are configured.
  return simulatedPaymentProvider;
}
