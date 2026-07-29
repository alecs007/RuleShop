import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { Logo } from "@/components/shop/logo";

export const metadata: Metadata = { title: "Autentificare" };

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.29a12 12 0 0 0 0 10.74l3.98-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.6 4.6 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="#1877F2" aria-hidden>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05v-2.66c0-3.03 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C18.61 23.09 24 18.1 24 12.07Z" />
    </svg>
  );
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) redirect(params.callbackUrl ?? "/");

  const callbackUrl = params.callbackUrl ?? "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo />
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-surface-raised p-6 sm:p-8">
          <h1 className="text-center text-xl font-semibold tracking-tight">
            Bine ai venit
          </h1>
          <p className="mt-1.5 text-center text-sm text-ink-muted">
            Autentifică-te pentru comenzi mai rapide și istoric salvat.
          </p>

          {params.error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-critical">
              Autentificarea a eșuat. Încearcă din nou.
            </p>
          )}

          <div className="mt-6 space-y-3">
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: callbackUrl });
              }}
            >
              <button className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-line bg-surface-raised text-sm font-medium transition-colors hover:border-ink-faint">
                <GoogleIcon /> Continuă cu Google
              </button>
            </form>

            <form
              action={async () => {
                "use server";
                await signIn("facebook", { redirectTo: callbackUrl });
              }}
            >
              <button className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-line bg-surface-raised text-sm font-medium transition-colors hover:border-ink-faint">
                <FacebookIcon /> Continuă cu Facebook
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
            Poți cumpăra și fără cont — coșul tău rămâne salvat.
          </p>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-ink-muted transition-colors hover:text-ink">
            ← Înapoi la magazin
          </Link>
        </p>
      </div>
    </main>
  );
}
