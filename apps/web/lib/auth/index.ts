import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { isStaff } from "@/lib/auth/roles";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

/**
 * Customers sign in through OAuth only. JWT sessions, so no database read per
 * request; the role rides in the token but is always re-checked on the server.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    Google({
      // Deterministic profile refresh on every sign-in.
      allowDangerousEmailAccountLinking: false,
    }),
    Facebook({
      allowDangerousEmailAccountLinking: false,
    }),
    /**
     * Password sign-in is for staff only. Every failure returns the same null,
     * whatever the cause, so nothing reveals whether the email exists.
     */
    Credentials({
      id: "admin-credentials",
      name: "Admin",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Parola", type: "password" },
      },
      async authorize(credentials) {
        const parsed = z
          .object({ email: z.email(), password: z.string().min(1).max(200) })
          .safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();

        // Attempts for the same email thin out to refusal, password aside.
        const gate = await rateLimit("login", email);
        if (!gate.allowed) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });
        // Active staff with a password set.
        if (!user?.passwordHash || !user.active || !isStaff(user.role)) {
          return null;
        }
        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        // Clear the budget, so earlier mistakes do not carry over.
        await resetRateLimit("login", email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present at sign-in; afterwards the role lives in the token.
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role ?? "CUSTOMER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as Role) ?? "CUSTOMER";
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id) {
        await prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => {});
      }
    },
  },
});
