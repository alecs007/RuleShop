"use client";

import { useActionState, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ShippingMethodsState } from "@/app/(control-plane)/admin/shipping/actions";

export interface MethodRow {
  id: string;
  label: string;
  /** Cost in lei, ca in formularul de produs (se converteste in bani la salvare). */
  costLei: string;
  etaDaysMin: string;
  etaDaysMax: string;
}

type SaveAction = (
  prev: ShippingMethodsState | undefined,
  formData: FormData,
) => Promise<ShippingMethodsState>;

/** Identitate stabila pentru animatii si chei React, independenta de ID-ul editabil. */
type Row = MethodRow & { uid: string };

const inputCls =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors focus:border-accent focus:bg-surface-raised";

/** ID kebab-case propus din eticheta, ca administratorul sa nu-l scrie manual. */
function slugifyId(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

/**
 * Metodele de livrare ale magazinului. Sunt doar lista de opțiuni cu costul de
 * listă — costul final, disponibilitatea și estimarea sunt decise la runtime de
 * regulile de livrare, deci aici nu se scrie nicio condiție.
 */
export function ShippingMethodsForm({
  action,
  initial,
}: {
  action: SaveAction;
  initial: MethodRow[];
}) {
  const [state, formAction, pending] = useActionState<
    ShippingMethodsState | undefined,
    FormData
  >(action, undefined);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((row, i) => ({ ...row, uid: `initial-${i}` })),
  );

  // `uid` e doar identitate de UI — nu ajunge in payload.
  const methodsJson = useMemo(
    () =>
      JSON.stringify(
        rows.map(({ id, label, costLei, etaDaysMin, etaDaysMax }) => ({
          id,
          label,
          costLei,
          etaDaysMin,
          etaDaysMax,
        })),
      ),
    [rows],
  );

  const update = (i: number, patch: Partial<MethodRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const move = (i: number, delta: number) =>
    setRows((prev) => {
      const next = [...prev];
      const target = i + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[i], next[target]] = [next[target]!, next[i]!];
      return next;
    });

  return (
    <form action={formAction}>
      <input type="hidden" name="methodsJson" value={methodsJson} />

      {state?.message && (
        <div
          className={
            state.ok
              ? "mb-4 flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 p-3 text-sm"
              : "mb-4 flex items-start gap-2.5 rounded-xl bg-red-50 p-3 text-sm text-critical"
          }
        >
          {state.ok ? (
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-positive"
              strokeWidth={1.75}
            />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          )}
          <div>
            <p className={state.ok ? "font-medium text-positive" : "font-medium"}>
              {state.message}
            </p>
            {state.warnings && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-ink-muted">
                {state.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-1.5">
                    <TriangleAlert
                      className="mt-0.5 size-3.5 shrink-0 text-caution"
                      strokeWidth={1.75}
                    />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-medium">Nume afișat</th>
              <th className="px-4 py-3 font-medium">ID (folosit în reguli)</th>
              <th className="px-4 py-3 font-medium">Cost de listă</th>
              <th className="px-4 py-3 font-medium">Estimare (zile)</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {rows.map((row, i) => (
                <motion.tr
                  key={row.uid}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <td className="px-4 py-3">
                    <input
                      value={row.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        // ID-ul se propune din eticheta doar cat timp e liber:
                        // odata folosit intr-o regula, nu trebuie sa se schimbe.
                        update(i, {
                          label,
                          ...(row.id === slugifyId(row.label)
                            ? { id: slugifyId(label) }
                            : {}),
                        });
                      }}
                      placeholder="ex: Curier express"
                      className={`${inputCls} w-full min-w-40`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={row.id}
                      onChange={(e) => update(i, { id: e.target.value })}
                      placeholder="curier-express"
                      className={`${inputCls} w-40 font-mono text-xs`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.costLei}
                        onChange={(e) => update(i, { costLei: e.target.value })}
                        className={`${inputCls} w-24 tabular-nums`}
                      />
                      <span className="text-xs text-ink-faint">lei</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="90"
                        value={row.etaDaysMin}
                        onChange={(e) => update(i, { etaDaysMin: e.target.value })}
                        className={`${inputCls} w-16 tabular-nums`}
                        aria-label="Minim zile"
                      />
                      <span className="text-ink-faint">–</span>
                      <input
                        type="number"
                        min="0"
                        max="90"
                        value={row.etaDaysMax}
                        onChange={(e) => update(i, { etaDaysMax: e.target.value })}
                        className={`${inputCls} w-16 tabular-nums`}
                        aria-label="Maxim zile"
                      />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label="Mută mai sus"
                        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-zinc-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowUp className="size-4" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === rows.length - 1}
                        aria-label="Mută mai jos"
                        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-zinc-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowDown className="size-4" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRows((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        disabled={rows.length === 1}
                        aria-label={`Șterge ${row.label || "metoda"}`}
                        title={
                          rows.length === 1
                            ? "Magazinul are nevoie de cel puțin o metodă"
                            : "Șterge metoda"
                        }
                        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-red-50 hover:text-critical disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() =>
          setRows((prev) => [
            ...prev,
            {
              uid: `new-${Date.now()}`,
              id: "",
              label: "",
              costLei: "0",
              etaDaysMin: "1",
              etaDaysMax: "3",
            },
          ])
        }
        className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm text-accent transition-colors hover:text-accent-ink hover:underline"
      >
        <Plus className="size-4" /> Adaugă o metodă
      </button>

      <div className="mt-6 flex items-center gap-3 border-t border-line pt-5">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Se salvează…" : "Salvează metodele"}
        </Button>
        <p className="text-xs text-ink-faint">
          Se aplică imediat în magazin — metodele nu trec prin publicare.
        </p>
      </div>
    </form>
  );
}
