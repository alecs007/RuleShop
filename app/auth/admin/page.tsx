import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { ShieldCheck } from "lucide-react";
import { auth, signIn } from "@/lib/auth";
import { isStaff } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Control Plane — Login" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user && isStaff(session.user.role)) redirect("/admin");

  async function loginAction(formData: FormData) {
    "use server";
    try {
      await signIn("admin-credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/admin",
      });
    } catch (error) {
      if (error instanceof AuthError) redirect("/auth/admin?error=1");
      throw error;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-white">
            <ShieldCheck className="size-5" strokeWidth={1.75} />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            Control Plane
          </h1>
          <p className="text-sm text-ink-muted">Acces rezervat personalului.</p>
        </div>

        <form
          action={loginAction}
          className="mt-8 space-y-4 rounded-2xl border border-line bg-surface-raised p-6 sm:p-8"
        >
          {params.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-critical">
              Date de autentificare incorecte.
            </p>
          )}

          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="mt-1.5 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent focus:bg-surface-raised"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Parola
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent focus:bg-surface-raised"
            />
          </div>

          <button className="h-11 w-full cursor-pointer rounded-lg bg-ink text-sm font-medium text-white transition-colors hover:bg-zinc-700">
            Autentificare
          </button>
        </form>
      </div>
    </main>
  );
}
