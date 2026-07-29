import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "accent" | "positive" | "caution" | "critical";

const tones: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-ink-muted",
  accent: "bg-blue-50 text-accent-ink",
  positive: "bg-green-50 text-positive",
  caution: "bg-amber-50 text-caution",
  critical: "bg-red-50 text-critical",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
