"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { flashMessage, FLASH_PARAM, isFlashKey } from "@/lib/ui/flash";
import { skipNextScrollReset } from "./scroll-to-top";

/**
 * Transformă `?flash=<cheie>` în toast, apoi scoate parametrul din URL ca
 * mesajul să nu reapară la refresh sau back. `id: key` lasă sonner să
 * deduplice (efectele rulează de două ori în dev).
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
    // Curățarea parametrului nu e o navigare — nu mișcăm pagina.
    skipNextScrollReset();
    router.replace(`${pathname}${search ? `?${search}` : ""}`, {
      scroll: false,
    });
  }, [searchParams, pathname, router]);

  return null;
}
