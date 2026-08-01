"use client";

import { toast } from "sonner";

/**
 * Formular pentru acțiunile fără rezultat vizibil în pagină (activează /
 * dezactivează, șterge, kill switch): trece prin server action și confirmă cu
 * un toast. Opțional cere o confirmare înainte, pentru acțiunile distructive.
 *
 * Acțiunile care redirecționează nu au nevoie de asta — ele duc mesajul prin
 * `withFlash` (vezi `lib/ui/flash.ts`).
 */
export function ActionForm({
  action,
  success,
  error = "Acțiunea nu a putut fi finalizată.",
  confirm,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  success?: string;
  error?: string;
  confirm?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      className={className}
      action={async (formData) => {
        if (confirm && !window.confirm(confirm)) return;
        try {
          await action(formData);
          if (success) toast.success(success);
        } catch (cause) {
          // Redirect-urile Next sunt semnalizate prin excepție — trebuie să treacă.
          const digest = (cause as { digest?: string })?.digest;
          if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
            throw cause;
          }
          toast.error(error);
        }
      }}
    >
      {children}
    </form>
  );
}
