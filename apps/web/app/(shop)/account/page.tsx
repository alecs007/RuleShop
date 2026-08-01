import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Gift, Package } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getActiveStore } from "@/lib/shop/store";
import { getAccountLoyalty } from "@/lib/shop/loyalty";
import { formatMoney } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Contul meu" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin?callbackUrl=/account");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) redirect("/auth/signin");

  // Nivelul si beneficiile vin din decizia LOYALTY, evaluata pe faptele
  // contului (fara coș): un client isi vede statutul curent, nu unul stocat.
  const store = await getActiveStore();
  const loyalty = await getAccountLoyalty(store.id);

  return (
    <div className="appear-content mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Contul meu</h1>

      <div className="mt-6 rounded-xl border border-line bg-surface-raised p-6">
        <div className="flex items-center gap-4">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={56}
              height={56}
              className="rounded-full"
            />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-full bg-zinc-100 text-lg font-semibold text-ink-muted">
              {(user.name ?? user.email).charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-sm text-ink-muted">{user.email}</p>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Nivel loialitate</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">{loyalty.tier}</Badge>
              {loyalty.tierFromRule && (
                <span className="text-xs text-ink-faint">stabilit de reguli</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Puncte</dt>
            <dd className="mt-1 font-medium tabular-nums">{user.loyaltyPoints}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Comenzi finalizate</dt>
            <dd className="mt-1 font-medium tabular-nums">{user.completedOrders}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">
              Total cheltuit
            </dt>
            <dd className="mt-1 font-medium tabular-nums">
              {formatMoney(user.lifetimeSpend, "RON")}
            </dd>
          </div>
        </dl>

        {/* Beneficiile acordate de reguli pentru acest cont */}
        {loyalty.benefits.length > 0 && (
          <div className="mt-6 border-t border-line pt-6">
            <p className="text-xs uppercase tracking-wide text-ink-faint">
              Beneficii active
            </p>
            <ul className="mt-2 space-y-1.5">
              {loyalty.benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2 text-sm">
                  <Gift
                    className="mt-0.5 size-4 shrink-0 text-accent"
                    strokeWidth={1.75}
                  />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loyalty.pointsMultiplier !== 1 && (
          <p className="mt-4 text-sm text-ink-muted">
            La comenzile tale se aplică un multiplicator de{" "}
            <span className="font-medium text-ink">×{loyalty.pointsMultiplier}</span>{" "}
            la puncte.
          </p>
        )}
      </div>

      <Link
        href="/orders"
        className="group mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface-raised p-5 transition-all hover:border-ink-faint hover:shadow-subtle"
      >
        <Package className="size-5 shrink-0 text-ink-muted" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Comenzile mele</span>
          <span className="block text-sm text-ink-muted">
            Urmărește statusul comenzilor și vezi istoricul.
          </span>
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
          strokeWidth={2}
        />
      </Link>
    </div>
  );
}
