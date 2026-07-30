"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Power, Star, Store } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { slugifyStoreName } from "@/lib/shop/store-slug";

/**
 * Magazinele platformei: lista cu ce administrezi acum si care e magazinul activ
 * (cel pe care il vad clientii), plus formularul de magazin nou.
 *
 * Toate operatiile sunt server actions cu garda `requirePlatformAdmin` — butonul
 * ascuns nu e o masura de securitate, iar rolul se verifica pe server la fiecare
 * apel. Aici se rezolva doar prezentarea si confirmarea prin toast.
 */

export interface StoreRow {
  id: string;
  name: string;
  slug: string;
  currency: string;
  locale: string;
  active: boolean;
  isDefault: boolean;
  products: number;
  orders: number;
}

export interface StoreActionState {
  ok: boolean;
  message?: string;
}

type StateAction = (
  prev: StoreActionState | undefined,
  formData: FormData,
) => Promise<StoreActionState>;

export function StoreManager({
  stores,
  currentStoreId,
  envOverrideSlug,
  createAction,
  selectAction,
  setDefaultAction,
  setActiveAction,
}: {
  stores: StoreRow[];
  /** Magazinul administrat acum (din comutatorul de panou). */
  currentStoreId: string;
  /** `DEFAULT_STORE_SLUG` din .env, cand e setat — decide el magazinul activ. */
  envOverrideSlug?: string;
  createAction: StateAction;
  selectAction: (formData: FormData) => Promise<StoreActionState>;
  setDefaultAction: StateAction;
  setActiveAction: StateAction;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  /** Rulează o acțiune de rând și confirmă rezultatul în toast. */
  function run(
    action: StateAction,
    store: StoreRow,
    fields: Record<string, string>,
  ) {
    setPendingId(store.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("storeId", store.id);
      for (const [key, value] of Object.entries(fields)) data.set(key, value);

      const state = await action(undefined, data);
      setPendingId(null);
      if (state.ok) toast.success(state.message ?? "Gata.");
      else toast.error(state.message ?? "Acțiunea nu a putut fi finalizată.");
    });
  }

  /** Comuta panoul pe alt magazin, confirmand doar ce a acceptat serverul. */
  function select(store: StoreRow) {
    setPendingId(store.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("storeId", store.id);

      const state = await selectAction(data);
      setPendingId(null);
      if (state.ok) {
        // Ca in comutatorul din header: rutele din cache-ul de router trebuie
        // sa se reincarce pe magazinul nou.
        router.refresh();
        toast.success(state.message ?? `Administrezi „${store.name}”.`);
      } else {
        toast.error(state.message ?? "Comutarea nu a reușit.");
      }
    });
  }

  return (
    <>
      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-raised">
        {stores.map((store) => {
          const isCurrent = store.id === currentStoreId;
          const busy = pendingId === store.id;
          return (
            <li key={store.id} className="flex flex-wrap items-center gap-3 p-4">
              <Store
                className={
                  store.active
                    ? "size-5 shrink-0 text-accent"
                    : "size-5 shrink-0 text-ink-faint"
                }
                strokeWidth={1.75}
              />

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {store.name}
                  <span className="font-mono text-xs text-ink-faint">
                    {store.slug}
                  </span>
                  {store.isDefault && <Badge tone="accent">activ</Badge>}
                  {isCurrent && <Badge tone="positive">administrezi</Badge>}
                  {!store.active && <Badge tone="critical">oprit</Badge>}
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {store.currency} · {store.locale} · {store.products}{" "}
                  {store.products === 1 ? "produs" : "produse"} · {store.orders}{" "}
                  {store.orders === 1 ? "comandă" : "comenzi"}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {busy && <Spinner className="size-4 text-ink-faint" />}
                {!isCurrent && store.active && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => select(store)}
                  >
                    Administrează
                  </Button>
                )}
                {!store.isDefault && store.active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(setDefaultAction, store, {})}
                    title="Clienții vor vedea acest magazin"
                  >
                    <Star className="size-4" strokeWidth={1.75} />
                    Fă-l activ
                  </Button>
                )}
                <Button
                  variant={store.active ? "danger" : "ghost"}
                  size="sm"
                  disabled={busy || (store.active && store.isDefault)}
                  onClick={() =>
                    run(setActiveAction, store, {
                      active: store.active ? "false" : "true",
                    })
                  }
                  title={
                    store.active && store.isDefault
                      ? "Magazinul activ nu poate fi oprit — fă alt magazin activ mai întâi"
                      : undefined
                  }
                >
                  {store.active ? (
                    <>
                      <Power className="size-4" strokeWidth={1.75} />
                      Oprește
                    </>
                  ) : (
                    <>
                      <Check className="size-4" strokeWidth={1.75} />
                      Pornește
                    </>
                  )}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {envOverrideSlug && (
        <p className="mt-3 text-xs text-caution">
          Atenție: <code className="font-mono">DEFAULT_STORE_SLUG</code> din{" "}
          <code className="font-mono">.env</code> este setat pe{" "}
          <code className="font-mono">{envOverrideSlug}</code> și are prioritate
          față de magazinul activ ales aici. Scoate-l ca să comanzi din panou ce
          văd clienții.
        </p>
      )}

      <CreateStoreForm action={createAction} />
    </>
  );
}

function CreateStoreForm({ action }: { action: StateAction }) {
  const [state, formAction, pending] = useActionState<
    StoreActionState | undefined,
    FormData
  >(action, undefined);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  /** Slug-ul urmează numele până când administratorul îl scrie el însuși. */
  const slugEdited = useRef(false);

  const lastState = useRef<StoreActionState | undefined>(undefined);
  useEffect(() => {
    if (!state || state === lastState.current) return;
    lastState.current = state;

    if (state.ok) {
      toast.success(state.message ?? "Magazin creat.");
      setName("");
      setSlug("");
      slugEdited.current = false;
    } else {
      toast.error(state.message ?? "Magazinul nu a putut fi creat.");
    }
  }, [state]);

  return (
    <form
      action={formAction}
      className="mt-8 rounded-xl border border-line bg-surface-raised p-5"
    >
      <h2 className="font-semibold">Magazin nou</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Pornește cu metodele de livrare implicite și cu toate cele șase rulesete
        publicate — motorul decide corect de la prima vizită. Produsele le adaugi
        după.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Nume" hint="Cum apare în magazin și în panou.">
          <input
            name="name"
            required
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugEdited.current) setSlug(slugifyStoreName(event.target.value));
            }}
            placeholder="RuleShop Deutschland"
            className={fieldClass}
          />
        </Field>

        <Field label="Slug" hint="Identificator stabil: litere mici și cratime.">
          <input
            name="slug"
            required
            value={slug}
            onChange={(event) => {
              slugEdited.current = true;
              setSlug(event.target.value);
            }}
            placeholder="ruleshop-de"
            className={`${fieldClass} font-mono`}
          />
        </Field>

        <Field label="Monedă" hint="Cod ISO din 3 litere.">
          <input
            name="currency"
            required
            defaultValue="RON"
            maxLength={3}
            placeholder="EUR"
            className={`${fieldClass} font-mono uppercase`}
          />
        </Field>

        <Field label="Limbă" hint="Format ll-CC.">
          <input
            name="locale"
            required
            defaultValue="ro-RO"
            placeholder="de-DE"
            className={`${fieldClass} font-mono`}
          />
        </Field>
      </div>

      <label className="mt-4 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="makeDefault"
          className="mt-0.5 size-4 cursor-pointer rounded border-line"
        />
        <span className="text-ink-muted">
          Fă-l imediat magazinul activ (clienții vor vedea acest magazin).
        </span>
      </label>

      <Button type="submit" disabled={pending} className="mt-5">
        {pending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
        {pending ? "Se creează…" : "Creează magazinul"}
      </Button>
    </form>
  );
}

const fieldClass =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      <span className="mt-1 block text-xs text-ink-faint">{hint}</span>
    </label>
  );
}
