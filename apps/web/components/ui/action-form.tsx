"use client";

import { toast } from "sonner";

/**
 * For actions with no visible result on the page (enable, delete, kill
 * switch): runs the server action and confirms with a toast, optionally
 * asking first. Actions that redirect carry their message with `withFlash`.
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
          // Next signals redirects by throwing; let those through.
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
