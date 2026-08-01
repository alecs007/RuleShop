import { Check, Circle, Dot, X } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { orderTimeline, type TimelineStep } from "@/lib/shop/order-status";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<TimelineStep["state"], typeof Check> = {
  done: Check,
  current: Dot,
  upcoming: Circle,
  failed: X,
};

const DOT_STYLES: Record<TimelineStep["state"], string> = {
  done: "border-positive bg-positive text-white",
  current: "border-accent bg-accent text-white",
  upcoming: "border-line bg-surface text-ink-faint",
  failed: "border-critical bg-critical text-white",
};

const LINE_STYLES: Record<TimelineStep["state"], string> = {
  done: "bg-positive",
  current: "bg-accent",
  upcoming: "bg-line",
  failed: "bg-critical",
};

/**
 * Unde se afla comanda, pe intelesul clientului: pasii parcursi, cel curent si
 * cei care urmeaza. Statusurile terminale (anulata/respinsa) inchid traseul —
 * nu afisam pasi care nu vor mai veni.
 */
export function OrderTimeline({ status }: { status: OrderStatus }) {
  const steps = orderTimeline(status);

  return (
    <ol className="flex items-start" aria-label="Stadiul comenzii">
      {steps.map((step, index) => {
        const Icon = ICONS[step.state];
        const isLast = index === steps.length - 1;
        return (
          <li
            key={step.label}
            className={cn("flex items-start", !isLast && "flex-1")}
          >
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  DOT_STYLES[step.state],
                )}
              >
                <Icon className="size-3.5" strokeWidth={2.5} />
              </span>
              <span
                className={cn(
                  "mt-1.5 max-w-20 text-center text-xs leading-tight",
                  step.state === "upcoming" ? "text-ink-faint" : "text-ink",
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              // Segmentul preia starea pasului URMATOR: linia devine verde doar
              // cand pasul spre care duce a fost atins.
              <span
                aria-hidden
                className={cn(
                  "mt-3 h-0.5 flex-1",
                  LINE_STYLES[
                    steps[index + 1]!.state === "upcoming"
                      ? "upcoming"
                      : steps[index + 1]!.state
                  ],
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
