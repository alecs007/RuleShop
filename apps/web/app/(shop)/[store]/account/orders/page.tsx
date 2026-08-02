import { redirect } from "next/navigation";
import { storeHref } from "@/lib/shop/routing";

/**
 * Orders have one canonical page, `/orders`, which works for guests too. The
 * old route stays as a redirect for saved links — inside the same store.
 */
export default async function AccountOrdersPage({
  params,
}: {
  params: Promise<{ store: string }>;
}) {
  const { store } = await params;
  redirect(storeHref(store === "__main" ? null : store, "/orders"));
}
