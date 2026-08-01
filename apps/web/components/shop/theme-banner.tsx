import { Megaphone } from "lucide-react";

/**
 * Bannerul decis de rulesetul THEME. Textul este randat de React ca text, nu ca
 * HTML — o regula nu poate injecta markup in pagina.
 */
export function ThemeBanner({ message }: { message: string }) {
  return (
    <div className="bg-accent text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium sm:px-6">
        <Megaphone className="size-4 shrink-0" strokeWidth={1.75} />
        <span>{message}</span>
      </div>
    </div>
  );
}
