"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import type { RuleAction } from "@ruleshop/rule-engine";
import {
  readShippingMethods,
  shippingMethodsSchema,
  withShippingMethods,
  type ShippingMethod,
} from "@/lib/shop/shipping-methods";

/** Un rand din formular: costul se introduce in lei, ca la produse. */
const rowSchema = z.object({
  id: z.string().trim().toLowerCase(),
  label: z.string().trim(),
  costLei: z.coerce.number().min(0).max(100_000),
  etaDaysMin: z.coerce.number().int().min(0).max(90),
  etaDaysMax: z.coerce.number().int().min(0).max(90),
});

export interface ShippingMethodsState {
  ok: boolean;
  message?: string;
  /** Reguli care trimit spre metode inexistente — nu blocheaza salvarea. */
  warnings?: string[];
}

function issueMessages(error: z.ZodError, rows: unknown[]): string[] {
  return error.issues.map((issue) => {
    const index = typeof issue.path[0] === "number" ? issue.path[0] : null;
    const row = index !== null ? (rows[index] as { label?: string } | undefined) : undefined;
    const prefix = row?.label ? `„${row.label}”: ` : index !== null ? `Metoda ${index + 1}: ` : "";
    return `${prefix}${issue.message}`;
  });
}

/** ID-urile de metode la care se refera actiunile regulilor de livrare. */
function referencedMethodIds(actions: unknown): string[] {
  if (!Array.isArray(actions)) return [];
  return (actions as RuleAction[])
    .filter(
      (a) =>
        a.type === "DISABLE_SHIPPING_METHOD" || a.type === "FORCE_SHIPPING_METHOD",
    )
    .map((a) => a.params?.method)
    .filter((m): m is string => typeof m === "string");
}

/**
 * Regulile de livrare care trimit spre metode care nu mai exista. Nu opresc
 * salvarea (o metoda poate fi scoasa temporar), dar administratorul trebuie sa
 * afle: o astfel de regula nu mai are efect.
 */
async function findDanglingRules(
  storeId: string,
  methods: ShippingMethod[],
): Promise<string[]> {
  const ids = new Set(methods.map((m) => m.id));
  const rules = await prisma.rule.findMany({
    where: { storeId, ruleSet: { category: "SHIPPING" } },
    select: { name: true, actions: true },
  });

  return rules
    .flatMap((rule) =>
      referencedMethodIds(rule.actions)
        .filter((id) => !ids.has(id))
        .map((id) => `„${rule.name}” se referă la metoda „${id}”, care nu mai există.`),
    )
    .filter((msg, i, all) => all.indexOf(msg) === i);
}

export async function saveShippingMethodsAction(
  _prev: ShippingMethodsState | undefined,
  formData: FormData,
): Promise<ShippingMethodsState> {
  const { user, storeId } = await requireAdmin();

  const raw = formData.get("methodsJson");
  let rows: unknown[];
  try {
    rows = JSON.parse(typeof raw === "string" ? raw : "[]");
  } catch {
    return { ok: false, message: "Datele formularului sunt invalide." };
  }

  const parsedRows = z.array(rowSchema).safeParse(rows);
  if (!parsedRows.success) {
    return {
      ok: false,
      message: "Verifică valorile introduse.",
      warnings: issueMessages(parsedRows.error, rows),
    };
  }

  // Ordinea rândurilor din formular devine ordinea de afisare in magazin.
  const candidate = parsedRows.data.map((row, index) => ({
    id: row.id,
    label: row.label,
    costCents: Math.round(row.costLei * 100),
    etaDaysMin: row.etaDaysMin,
    etaDaysMax: row.etaDaysMax,
    sortOrder: index + 1,
  }));

  const parsed = shippingMethodsSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Metodele nu sunt valide.",
      warnings: issueMessages(parsed.error, candidate),
    };
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return { ok: false, message: "Magazinul nu există." };

  const before = readShippingMethods(store.settings);
  const settings = withShippingMethods(store.settings, parsed.data);

  await prisma.store.update({
    where: { id: storeId },
    data: { settings: settings as Prisma.InputJsonValue },
  });
  await logAudit({
    storeId,
    action: "STORE_SETTINGS_UPDATED",
    entityType: "Store",
    entityId: storeId,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    before: { shippingMethods: before },
    after: { shippingMethods: parsed.data },
  });

  const warnings = await findDanglingRules(storeId, parsed.data);
  revalidatePath("/", "layout");

  return {
    ok: true,
    message: `${parsed.data.length} metode salvate. Costul final rămâne decis de regulile de livrare.`,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
