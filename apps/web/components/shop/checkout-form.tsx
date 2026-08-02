"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PAYMENT_METHODS } from "@/lib/shop/payment";
import {
  placeOrderAction,
  type CheckoutState,
} from "@/app/(shop)/[store]/checkout/actions";
import { StorePrefixField } from "./store-prefix-field";

const inputCls =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent focus:bg-surface-raised";

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-xs text-critical">{error}</p>}
    </div>
  );
}

function AddressFields({
  prefix,
  errors,
  defaults,
}: {
  prefix: "shipping" | "billing";
  errors: Record<string, string>;
  defaults?: { name?: string | null; country?: string };
}) {
  const err = (field: string) => errors[`${prefix}.${field}`];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nume complet" name={`${prefix}.name`} error={err("name")}>
        <input
          id={`${prefix}.name`}
          name={`${prefix}.name`}
          required
          autoComplete={prefix === "shipping" ? "name" : "billing name"}
          defaultValue={defaults?.name ?? ""}
          className={inputCls}
        />
      </Field>
      <Field label="Telefon" name={`${prefix}.phone`} error={err("phone")}>
        <input
          id={`${prefix}.phone`}
          name={`${prefix}.phone`}
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="07xx xxx xxx"
          className={inputCls}
        />
      </Field>
      <Field label="Stradă și număr" name={`${prefix}.street`} error={err("street")}>
        <input
          id={`${prefix}.street`}
          name={`${prefix}.street`}
          required
          autoComplete="street-address"
          className={inputCls}
        />
      </Field>
      <Field label="Oraș" name={`${prefix}.city`} error={err("city")}>
        <input
          id={`${prefix}.city`}
          name={`${prefix}.city`}
          required
          autoComplete="address-level2"
          className={inputCls}
        />
      </Field>
      <Field label="Cod poștal" name={`${prefix}.postalCode`} error={err("postalCode")}>
        <input
          id={`${prefix}.postalCode`}
          name={`${prefix}.postalCode`}
          required
          autoComplete="postal-code"
          className={inputCls}
        />
      </Field>
      <Field label="Țară (cod, ex: RO)" name={`${prefix}.country`} error={err("country")}>
        <input
          id={`${prefix}.country`}
          name={`${prefix}.country`}
          required
          maxLength={2}
          autoComplete="country"
          defaultValue={defaults?.country ?? "RO"}
          className={`${inputCls} uppercase`}
        />
      </Field>
    </div>
  );
}

/**
 * The checkout form. No amounts are sent from the client: the server
 * recomputes price, shipping and total before placing the order.
 */
export function CheckoutForm({
  prefix,
  defaultEmail,
  defaultName,
}: {
  /** The store prefix, so the order lands in the store from the address bar. */
  prefix: string | null;
  defaultEmail?: string | null;
  defaultName?: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    CheckoutState | undefined,
    FormData
  >(placeOrderAction, undefined);
  const [billingSame, setBillingSame] = useState(true);
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-8">
      <StorePrefixField prefix={prefix} />
      {state && !state.ok && state.message && (
        <div
          role="alert"
          className="slide-in flex items-start gap-2.5 rounded-lg bg-red-50 p-3 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <p className="font-medium">{state.message}</p>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold">Date de contact</h2>
        <div className="mt-3">
          <Field label="Email" name="email" error={errors.email}>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={defaultEmail ?? ""}
              className={inputCls}
            />
          </Field>
          <p className="mt-1.5 text-xs text-ink-faint">
            Pe această adresă primești confirmarea comenzii.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Adresa de livrare</h2>
        <div className="mt-3">
          <AddressFields
            prefix="shipping"
            errors={errors}
            defaults={{ name: defaultName }}
          />
        </div>
      </section>

      <section>
        <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="billingSameAsShipping"
            checked={billingSame}
            onChange={(e) => setBillingSame(e.target.checked)}
            className="size-4 accent-ink"
          />
          Adresa de facturare este aceeași
        </label>
        {/* Mounted conditionally rather than hidden: the fields are
            `required`, and an invisible required field blocks submission. */}
        {!billingSame && (
          <div className="slide-in">
            <h2 className="mt-6 text-lg font-semibold">Adresa de facturare</h2>
            <div className="mt-3">
              <AddressFields prefix="billing" errors={errors} />
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Plata</h2>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
          <Lock className="size-3.5" strokeWidth={1.75} />
          Plată simulată — nu se procesează date reale de card.
        </p>
        <div className="mt-3 space-y-2">
          {PAYMENT_METHODS.map((method, index) => (
            <label
              key={method.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm transition-colors hover:border-ink-faint has-checked:border-ink"
            >
              <input
                type="radio"
                name="paymentMethod"
                value={method.id}
                defaultChecked={index === 0}
                className="size-4 accent-ink"
              />
              {method.label}
            </label>
          ))}
        </div>
        {errors.paymentMethod && (
          <p className="mt-1 text-xs text-critical">{errors.paymentMethod}</p>
        )}
      </section>

      <div className="border-t border-line pt-6">
        <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
          {pending ? <Spinner /> : <ShieldCheck className="size-5" strokeWidth={1.75} />}
          {pending ? "Se plasează comanda…" : "Plasează comanda"}
        </Button>
        <p className="mt-2 text-xs text-ink-faint">
          Comanda trece printr-o verificare antifraudă automată înainte de
          confirmare.
        </p>
      </div>
    </form>
  );
}
