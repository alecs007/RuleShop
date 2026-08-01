import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { DecisionCategory } from "@ruleshop/rule-engine";
import {
  readShippingMethods,
  shippingMethodOptions,
} from "@/lib/shop/shipping-methods";
import type { DynamicParamOptions } from "./form-mapping";

/**
 * Listele de valori care depind de configurarea magazinului, pentru editorul
 * de reguli. Astfel administratorul alege metoda de livrare dintr-un dropdown
 * cu metodele lui reale, in loc sa scrie un ID pe care il poate greși.
 */
export async function getDynamicParamOptions(
  storeId: string,
  category: DecisionCategory,
): Promise<DynamicParamOptions> {
  if (category !== "SHIPPING") return {};

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { settings: true },
  });
  return {
    shippingMethods: shippingMethodOptions(readShippingMethods(store?.settings)),
  };
}
