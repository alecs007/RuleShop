"use client";

import { Toaster as SonnerToaster } from "sonner";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

/**
 * Toast-urile aplicației (sonner), stilate cu tokenii proiectului: card alb,
 * linie subțire, umbră discretă — nu paleta implicită a bibliotecii.
 *
 * Poziția e sus-centru, decalată sub headerul sticky, ca să nu acopere
 * căutarea și ca să nu se bată cu foaia de filtre de jos pe mobil.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={{ top: "76px" }}
      mobileOffset={{ top: "72px" }}
      gap={8}
      duration={3500}
      icons={{
        success: (
          <CheckCircle2 className="size-4 text-positive" strokeWidth={2} />
        ),
        error: <AlertCircle className="size-4 text-critical" strokeWidth={2} />,
        info: <Info className="size-4 text-accent" strokeWidth={2} />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border-line !bg-surface-raised !text-ink !shadow-subtle !font-sans !gap-2.5",
          title: "!text-sm !font-medium",
          description: "!text-xs !text-ink-muted",
          actionButton: "!bg-ink !text-white !rounded-lg",
          cancelButton: "!bg-transparent !text-ink-muted",
          closeButton: "!border-line !bg-surface-raised !text-ink-muted",
        },
      }}
    />
  );
}
