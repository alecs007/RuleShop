import { Megaphone } from "lucide-react";

/**
 * The banner the THEME ruleset decides. React renders it as text, not HTML, so
 * a rule cannot inject markup into the page.
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
