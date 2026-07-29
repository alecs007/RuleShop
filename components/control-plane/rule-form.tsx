"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { tryHumanizeRule } from "@/lib/rules/humanize";
import { nearestPriorityValue, PRIORITY_LEVELS } from "@/lib/rules/priority";
import { formatMoney } from "@/lib/utils/money";
import type { RuleFormState } from "@/app/(control-plane)/admin/rules/actions";

// ---------------------------------------------------------------------------
// Tipuri serializabile primite de la server (fara functii)
// ---------------------------------------------------------------------------

export interface OperatorOption {
  id: string;
  label: string;
  factTypes: string[];
  unary?: boolean;
}

export interface FactOption {
  path: string;
  label: string;
  type: string;
  example?: string;
}

export interface ActionParamOption {
  name: string;
  type: "number" | "string" | "boolean" | "string[]" | "record";
  required: boolean;
  min?: number;
  max?: number;
  oneOf?: string[];
}

export interface ActionOption {
  type: string;
  label: string;
  params: ActionParamOption[];
}

interface ConditionRow {
  fact: string;
  operator: string;
  value: string; // brut, parsat la construirea JSON-ului
  value2: string; // pentru "between"
}

interface ActionRow {
  type: string;
  params: Record<string, string>;
}

export interface RuleFormInitial {
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  rootOp: "AND" | "OR";
  conditions: ConditionRow[] | null; // null => structura prea complexa pt formular
  conditionsJson: string;
  actions: ActionRow[];
}

type SaveAction = (
  prev: RuleFormState | undefined,
  formData: FormData,
) => Promise<RuleFormState>;

// ---------------------------------------------------------------------------
// Constructia JSON-ului din randuri
// ---------------------------------------------------------------------------

function parseValue(row: ConditionRow, factType: string, operator?: OperatorOption): unknown {
  if (operator?.unary) return undefined;
  if (row.operator === "between") {
    // Valori incomplete => undefined, ca sa nu se salveze 0 pe furis.
    if (row.value === "" || row.value2 === "") return undefined;
    return [Number(row.value), Number(row.value2)];
  }
  if (["in", "notIn", "containsAny", "containsAll"].includes(row.operator)) {
    const items = row.value.split(",").map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return undefined;
    return factType === "number" ? items.map(Number) : items;
  }
  if (factType === "boolean") return row.value === "true";
  if (row.value === "") return undefined;
  if (factType === "number") {
    const n = Number(row.value);
    return Number.isFinite(n) ? n : undefined;
  }
  return row.value;
}

function buildConditionsJson(
  rows: ConditionRow[],
  rootOp: "AND" | "OR",
  facts: FactOption[],
  operators: OperatorOption[],
): string {
  const leaves = rows.map((row) => {
    const fact = facts.find((f) => f.path === row.fact);
    const op = operators.find((o) => o.id === row.operator);
    const value = parseValue(row, fact?.type ?? "string", op);
    return {
      type: "condition" as const,
      fact: row.fact,
      operator: row.operator,
      ...(value === undefined ? {} : { value }),
    };
  });
  if (leaves.length === 1) return JSON.stringify(leaves[0]);
  return JSON.stringify({ type: "group", op: rootOp, children: leaves });
}

function buildActionsJson(rows: ActionRow[], actionDefs: ActionOption[]): string {
  return JSON.stringify(
    rows.map((row) => {
      const def = actionDefs.find((a) => a.type === row.type);
      const params: Record<string, unknown> = {};
      for (const spec of def?.params ?? []) {
        const raw = row.params[spec.name];
        if (raw === undefined || raw === "") continue;
        params[spec.name] =
          spec.type === "number" ? Number(raw) : spec.type === "boolean" ? raw === "true" : raw;
      }
      return { type: row.type, params };
    }),
  );
}

// ---------------------------------------------------------------------------
// Componenta
// ---------------------------------------------------------------------------

const inputCls =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors focus:border-accent focus:bg-surface-raised";

/** Nume prietenoase pentru parametrii actiunilor (in loc de cheile tehnice). */
const PARAM_LABELS: Record<string, string> = {
  value: "valoare",
  valueCents: "sumă în bani",
  priceCents: "preț în bani",
  costCents: "cost în bani",
  factor: "factor",
  badge: "text badge",
  method: "metodă",
  decision: "decizie",
  signal: "semnal",
  minDays: "min. zile",
  maxDays: "max. zile",
  maxQuantity: "cantitate max.",
  message: "mesaj",
  points: "puncte",
  benefit: "beneficiu",
  token: "token",
  variant: "variantă",
  available: "disponibil",
};

/** Sufix de unitate afisat langa input (%, lei etc). */
function paramSuffix(actionType: string, paramName: string): string | null {
  if (paramName.endsWith("Cents")) return null; // arata echivalentul in lei
  if (actionType.includes("DISCOUNT_PERCENT") && paramName === "value") return "%";
  if (paramName === "minDays" || paramName === "maxDays") return "zile";
  return null;
}

export function RuleForm({
  action,
  facts,
  operators,
  actionDefs,
  initial,
}: {
  action: SaveAction;
  facts: FactOption[];
  operators: OperatorOption[];
  actionDefs: ActionOption[];
  initial?: RuleFormInitial;
}) {
  const [state, formAction, pending] = useActionState<RuleFormState | undefined, FormData>(
    action,
    undefined,
  );

  const firstFact = facts[0]!;
  const [jsonMode, setJsonMode] = useState(initial ? initial.conditions === null : false);
  const [rootOp, setRootOp] = useState<"AND" | "OR">(initial?.rootOp ?? "AND");
  const [rows, setRows] = useState<ConditionRow[]>(
    initial?.conditions ?? [
      { fact: firstFact.path, operator: "eq", value: "", value2: "" },
    ],
  );
  const [rawJson, setRawJson] = useState(initial?.conditionsJson ?? "");
  const [actionRows, setActionRows] = useState<ActionRow[]>(
    initial?.actions ?? [{ type: actionDefs[0]?.type ?? "", params: {} }],
  );

  const conditionsJson = useMemo(
    () => (jsonMode ? rawJson : buildConditionsJson(rows, rootOp, facts, operators)),
    [jsonMode, rawJson, rows, rootOp, facts, operators],
  );
  const actionsJson = useMemo(
    () => buildActionsJson(actionRows, actionDefs),
    [actionRows, actionDefs],
  );

  // Previzualizare live: regula tradusa in limbaj natural, ca sa fie clar
  // pentru oricine ce va face inainte de salvare.
  const preview = useMemo(() => {
    try {
      return tryHumanizeRule(JSON.parse(conditionsJson), JSON.parse(actionsJson));
    } catch {
      return null;
    }
  }, [conditionsJson, actionsJson]);

  const operatorsFor = (factPath: string) => {
    const type = facts.find((f) => f.path === factPath)?.type ?? "string";
    return operators.filter(
      (o) => o.factTypes.includes(type) || o.factTypes.includes("any"),
    );
  };

  const updateRow = (i: number, patch: Partial<ConditionRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const updateActionRow = (i: number, patch: Partial<ActionRow>) =>
    setActionRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <input type="hidden" name="conditionsJson" value={conditionsJson} />
      <input type="hidden" name="actionsJson" value={actionsJson} />

      {state && !state.ok && (
        <div className="flex items-start gap-2.5 rounded-lg bg-red-50 p-3 text-sm text-critical">
          <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <div>
            <p className="font-medium">{state.message}</p>
            {state.issues && (
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
                {state.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Date generale */}
      <div className="grid gap-4 sm:grid-cols-[1fr_280px]">
        <div>
          <label htmlFor="name" className="text-sm font-medium">Nume</label>
          <input
            id="name"
            name="name"
            required
            defaultValue={initial?.name}
            placeholder="ex: Reducere VIP 15%"
            className={`${inputCls} mt-1.5 h-10 w-full`}
          />
        </div>
        <div>
          <label htmlFor="priority" className="text-sm font-medium">Prioritate</label>
          <select
            id="priority"
            name="priority"
            defaultValue={nearestPriorityValue(initial?.priority ?? 100)}
            className={`${inputCls} mt-1.5 h-10 w-full cursor-pointer`}
          >
            {PRIORITY_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label} — {level.hint}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="description" className="text-sm font-medium">
          Descriere (optional)
        </label>
        <input
          id="description"
          name="description"
          defaultValue={initial?.description}
          placeholder="de ce există această regulă"
          className={`${inputCls} mt-1.5 h-10 w-full`}
        />
      </div>

      {/* Conditii */}
      <fieldset className="rounded-xl border border-line bg-surface-raised p-4">
        <legend className="sr-only">Condiții</legend>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Condiții (DACĂ…)</p>
          <button
            type="button"
            onClick={() => {
              if (!jsonMode) setRawJson(conditionsJson);
              setJsonMode((v) => !v);
            }}
            className="cursor-pointer text-xs text-ink-muted underline-offset-2 hover:underline"
          >
            {jsonMode ? "Editor simplu" : "Editor JSON (avansat)"}
          </button>
        </div>

        {jsonMode ? (
          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            rows={8}
            spellCheck={false}
            className="mt-3 w-full rounded-lg border border-line bg-surface p-3 font-mono text-xs outline-none focus:border-accent"
          />
        ) : (
          <div className="mt-3 space-y-2.5">
            <AnimatePresence initial={false}>
            {rows.length > 1 && (
              <motion.div
                key="root-op"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex items-center gap-2 overflow-hidden text-sm"
              >
                <span className="text-ink-muted">Se potrivesc</span>
                <select
                  value={rootOp}
                  onChange={(e) => setRootOp(e.target.value as "AND" | "OR")}
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="AND">toate condițiile (ȘI)</option>
                  <option value="OR">oricare condiție (SAU)</option>
                </select>
              </motion.div>
            )}

            {rows.map((row, i) => {
              const rowOps = operatorsFor(row.fact);
              const op = operators.find((o) => o.id === row.operator);
              const factType = facts.find((f) => f.path === row.fact)?.type ?? "string";
              return (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="flex flex-wrap items-center gap-2 overflow-hidden"
                >
                  <select
                    value={row.fact}
                    onChange={(e) => {
                      const nextFact = e.target.value;
                      const nextOps = operatorsFor(nextFact);
                      updateRow(i, {
                        fact: nextFact,
                        operator: nextOps.some((o) => o.id === row.operator)
                          ? row.operator
                          : nextOps[0]!.id,
                      });
                    }}
                    className={`${inputCls} cursor-pointer`}
                  >
                    {facts.map((f) => (
                      <option key={f.path} value={f.path}>{f.label}</option>
                    ))}
                  </select>

                  <select
                    value={row.operator}
                    onChange={(e) => updateRow(i, { operator: e.target.value })}
                    className={`${inputCls} cursor-pointer`}
                  >
                    {rowOps.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>

                  {!op?.unary &&
                    (row.operator === "between" ? (
                      <>
                        <input
                          type="number"
                          value={row.value}
                          onChange={(e) => updateRow(i, { value: e.target.value })}
                          placeholder="min"
                          className={`${inputCls} w-24`}
                        />
                        <input
                          type="number"
                          value={row.value2}
                          onChange={(e) => updateRow(i, { value2: e.target.value })}
                          placeholder="max"
                          className={`${inputCls} w-24`}
                        />
                      </>
                    ) : factType === "boolean" ? (
                      <select
                        value={row.value || "true"}
                        onChange={(e) => updateRow(i, { value: e.target.value })}
                        className={`${inputCls} cursor-pointer`}
                      >
                        <option value="true">adevărat</option>
                        <option value="false">fals</option>
                      </select>
                    ) : (
                      <>
                        <input
                          type={
                            factType === "number" &&
                            !["in", "notIn"].includes(row.operator)
                              ? "number"
                              : "text"
                          }
                          value={row.value}
                          onChange={(e) => updateRow(i, { value: e.target.value })}
                          placeholder={
                            ["in", "notIn", "containsAny", "containsAll"].includes(row.operator)
                              ? "valori separate prin virgulă"
                              : (facts.find((f) => f.path === row.fact)?.example ?? "valoare")
                          }
                          className={`${inputCls} min-w-40 flex-1`}
                        />
                        {/* Sumele sunt in bani — aratam echivalentul in lei */}
                        {row.fact.endsWith("Cents") && row.value !== "" &&
                          Number.isFinite(Number(row.value)) && (
                            <span className="text-xs text-ink-faint">
                              = {formatMoney(Number(row.value))}
                            </span>
                          )}
                      </>
                    ))}

                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Șterge condiția"
                      className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-red-50 hover:text-critical"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </motion.div>
              );
            })}
            </AnimatePresence>

            <button
              type="button"
              onClick={() =>
                setRows((prev) => [
                  ...prev,
                  { fact: firstFact.path, operator: "eq", value: "", value2: "" },
                ])
              }
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-accent transition-colors hover:text-accent-ink hover:underline"
            >
              <Plus className="size-4" /> Adaugă o condiție
            </button>
          </div>
        )}
      </fieldset>

      {/* Actiuni — acelasi layout de randuri ca la conditii */}
      <fieldset className="rounded-xl border border-line bg-surface-raised p-4">
        <legend className="sr-only">Acțiuni</legend>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Acțiuni (ATUNCI…)</p>
        </div>
        <div className="mt-3 space-y-2.5">
          <AnimatePresence initial={false}>
          {actionRows.map((row, i) => {
            const def = actionDefs.find((a) => a.type === row.type);
            return (
              <motion.div
                key={i}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex flex-wrap items-center gap-2 overflow-hidden"
              >
                <select
                  value={row.type}
                  onChange={(e) => updateActionRow(i, { type: e.target.value, params: {} })}
                  className={`${inputCls} cursor-pointer`}
                >
                  {actionDefs.map((a) => (
                    <option key={a.type} value={a.type}>{a.label}</option>
                  ))}
                </select>

                {def?.params.map((spec) =>
                  spec.oneOf ? (
                    <select
                      key={spec.name}
                      value={row.params[spec.name] ?? spec.oneOf[0]}
                      onChange={(e) =>
                        updateActionRow(i, {
                          params: { ...row.params, [spec.name]: e.target.value },
                        })
                      }
                      className={`${inputCls} cursor-pointer`}
                    >
                      {spec.oneOf.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  ) : spec.type === "boolean" ? (
                    <select
                      key={spec.name}
                      value={row.params[spec.name] ?? "true"}
                      onChange={(e) =>
                        updateActionRow(i, {
                          params: { ...row.params, [spec.name]: e.target.value },
                        })
                      }
                      className={`${inputCls} cursor-pointer`}
                    >
                      <option value="true">da</option>
                      <option value="false">nu</option>
                    </select>
                  ) : (
                    <span key={spec.name} className="flex items-center gap-1.5">
                      <input
                        type={spec.type === "number" ? "number" : "text"}
                        step={spec.type === "number" ? "any" : undefined}
                        min={spec.min}
                        max={spec.max}
                        required={spec.required}
                        value={row.params[spec.name] ?? ""}
                        onChange={(e) =>
                          updateActionRow(i, {
                            params: { ...row.params, [spec.name]: e.target.value },
                          })
                        }
                        placeholder={PARAM_LABELS[spec.name] ?? spec.name}
                        className={`${inputCls} w-40`}
                      />
                      {paramSuffix(row.type, spec.name) && (
                        <span className="text-sm text-ink-muted">
                          {paramSuffix(row.type, spec.name)}
                        </span>
                      )}
                      {/* Sumele se introduc in bani — aratam echivalentul in lei */}
                      {spec.name.endsWith("Cents") &&
                        row.params[spec.name] &&
                        Number.isFinite(Number(row.params[spec.name])) && (
                          <span className="text-xs text-ink-faint">
                            = {formatMoney(Number(row.params[spec.name]))}
                          </span>
                        )}
                    </span>
                  ),
                )}

                {actionRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setActionRows((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    aria-label="Șterge acțiunea"
                    className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-red-50 hover:text-critical"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </motion.div>
            );
          })}
          </AnimatePresence>

          <button
            type="button"
            onClick={() =>
              setActionRows((prev) => [
                ...prev,
                { type: actionDefs[0]?.type ?? "", params: {} },
              ])
            }
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-accent transition-colors hover:text-accent-ink hover:underline"
          >
            <Plus className="size-4" /> Adaugă o acțiune
          </button>
        </div>
      </fieldset>

      {/* Previzualizare live in limbaj natural */}
      <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
        <div className="min-w-0 text-sm leading-relaxed">
          <p className="font-medium text-accent-ink">Așa se citește regula ta:</p>
          {preview ? (
            <motion.p
              key={`${preview.if}|${preview.then}`}
              initial={{ opacity: 0.35 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="mt-1 text-ink"
            >
              <span className="font-semibold">DACĂ</span> {preview.if}{" "}
              <span className="font-semibold">ATUNCI</span> {preview.then}.
            </motion.p>
          ) : (
            <p className="mt-1 text-ink-muted">
              Completează condițiile și acțiunile — previzualizarea apare aici.
            </p>
          )}
        </div>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={initial?.enabled ?? true}
          className="size-4 accent-ink"
        />
        Regulă activată (intră în următoarea publicare)
      </label>

      <div className="flex items-center gap-3 border-t border-line pt-5">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Se salvează…" : "Salvează regula"}
        </Button>
        <Link href="." className="text-sm text-ink-muted hover:text-ink">
          Renunță
        </Link>
        <p className="ml-auto text-xs text-ink-faint">
          Modificările devin live abia după publicare.
        </p>
      </div>
    </form>
  );
}
