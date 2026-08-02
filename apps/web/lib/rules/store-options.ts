import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { DecisionCategory } from "@ruleshop/rule-engine";
import {
  readShippingMethods,
  shippingMethodOptions,
} from "@ruleshop/storefront";
import type { DynamicParamOptions } from "./form-mapping";

/**
 * The value lists that depend on store configuration, so an admin picks a
 * shipping method from a dropdown of their real ones instead of typing an id.
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
