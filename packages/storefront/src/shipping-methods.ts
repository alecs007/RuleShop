import { z } from "zod";

/**
 * Shipping methods are configuration (`Store.settings.shippingMethods`), not
 * code, so a new store can have its own without touching the app. Cost and
 * availability are then decided at runtime by the SHIPPING ruleset.
 */
export const shippingMethodSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "ID metodă: kebab-case (ex: curier-express)"),
    label: z.string().min(1).max(80),
    /** List price, before rules. */
    costCents: z.number().int().min(0).max(10_000_000),
    etaDaysMin: z.number().int().min(0).max(90),
    etaDaysMax: z.number().int().min(0).max(90),
    /** Display order; ties are broken by cost. */
    sortOrder: z.number().int().default(0),
  })
  .refine((m) => m.etaDaysMax >= m.etaDaysMin, {
    message: "Estimarea maximă nu poate fi mai mică decât cea minimă.",
    path: ["etaDaysMax"],
  });

export type ShippingMethod = z.infer<typeof shippingMethodSchema>;

export const shippingMethodsSchema = z
  .array(shippingMethodSchema)
  .min(1, "Magazinul are nevoie de cel puțin o metodă de livrare.")
  .max(12, "Maximum 12 metode de livrare.")
  .refine((list) => new Set(list.map((m) => m.id)).size === list.length, {
    message: "Fiecare metodă are nevoie de un ID unic.",
  });

export const DEFAULT_SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: "curier-standard",
    label: "Curier standard",
    costCents: 1999,
    etaDaysMin: 2,
    etaDaysMax: 4,
    sortOrder: 1,
  },
  {
    id: "curier-express",
    label: "Curier express",
    costCents: 3499,
    etaDaysMin: 1,
    etaDaysMax: 2,
    sortOrder: 2,
  },
  {
    id: "easybox",
    label: "Ridicare din easybox",
    costCents: 1499,
    etaDaysMin: 2,
    etaDaysMax: 5,
    sortOrder: 3,
  },
  {
    id: "ridicare-magazin",
    label: "Ridicare din magazin",
    costCents: 0,
    etaDaysMin: 0,
    etaDaysMax: 1,
    sortOrder: 4,
  },
];

/** Invalid settings fall back to the defaults rather than breaking the store. */
export function readShippingMethods(settings: unknown): ShippingMethod[] {
  const parsed = z
    .object({ shippingMethods: shippingMethodsSchema })
    .safeParse(settings);
  if (!parsed.success) return DEFAULT_SHIPPING_METHODS;

  return sortMethods(parsed.data.shippingMethods);
}

export function usesDefaultShippingMethods(settings: unknown): boolean {
  return !z
    .object({ shippingMethods: shippingMethodsSchema })
    .safeParse(settings).success;
}

export function sortMethods(methods: ShippingMethod[]): ShippingMethod[] {
  return [...methods].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.costCents - b.costCents,
  );
}

/** Replaces the methods and leaves the rest of `settings` untouched. */
export function withShippingMethods(
  settings: unknown,
  methods: ShippingMethod[],
): Record<string, unknown> {
  const base =
    typeof settings === "object" && settings !== null && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  return { ...base, shippingMethods: sortMethods(methods) };
}

export function shippingMethodOptions(
  methods: ShippingMethod[],
): { value: string; label: string }[] {
  return methods.map((m) => ({ value: m.id, label: `${m.label} (${m.id})` }));
}
