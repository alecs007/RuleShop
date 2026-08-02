"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { flashMessage, FLASH_PARAM, isFlashKey } from "@/lib/ui/flash";
import { skipNextScrollReset } from "./scroll-to-top";

/**
 * Turns `?flash=<key>` into a toast, then drops the parameter so the message
 * does not come back on refresh. `id: key` lets sonner deduplicate, since
 * effects run twice in dev.
 */
export function FlashToast() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const key = searchParams.get(FLASH_PARAM);
    if (!isFlashKey(key)) return;

    const flash = flashMessage(key);
    const options = { id: key, description: flash.description };
    if (flash.tone === "success") toast.success(flash.message, options);
    else if (flash.tone === "error") toast.error(flash.message, options);
    else toast.info(flash.message, options);

    const next = new URLSearchParams(searchParams);
    next.delete(FLASH_PARAM);
    const search = next.toString();
    // Clearing the parameter is not a navigation: do not move the page.
    skipNextScrollReset();
    router.replace(`${pathname}${search ? `?${search}` : ""}`, {
      scroll: false,
    });
  }, [searchParams, pathname, router]);

  return null;
}
