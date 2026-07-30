/**
 * Plata — simulata, dar in spatele unei interfete de provider, ca integrarea
 * unui procesator real (Stripe, Netopia) sa nu ceara modificarea fluxului de
 * checkout: se adauga o implementare noua si se schimba `getPaymentProvider`.
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
  /** Referinta tranzactiei, pastrata pe comanda. */
  reference: string | null;
  /** Mesaj pentru client cand plata a fost refuzata. */
  message?: string;
  /** true cand plata se incaseaza la livrare (ramburs). */
  deferred?: boolean;
}

export interface PaymentProvider {
  id: string;
  authorize(intent: PaymentIntent): Promise<PaymentResult>;
}

function reference(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Provider simulat: autorizeaza instant. Metoda „card-refuzat" exista ca
 * jurizarea sa poata verifica si tratarea plăților eșuate.
 */
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
  // Aici se va alege providerul real cand exista chei configurate.
  return simulatedPaymentProvider;
}
