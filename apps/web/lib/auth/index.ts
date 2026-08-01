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
 * Autentificarea clientilor: exclusiv OAuth (Google, Facebook).
 * Sesiuni JWT (fara citiri de DB per request); adapterul Prisma persista
 * utilizatorii si conturile legate. Rolul este inclus in token si verificat
 * pe server — niciodata doar in client.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    Google({
      // refresh determinist al profilului la fiecare login
      allowDangerousEmailAccountLinking: false,
    }),
    Facebook({
      allowDangerousEmailAccountLinking: false,
    }),
    /**
     * Login cu parola EXCLUSIV pentru staff (control plane). Clientii se
     * autentifica doar prin OAuth. Raspunsurile de esec sunt identice
     * (null) indiferent de cauza — nu divulgam daca emailul exista.
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

        // Anti brute-force pe cont: incercarile pentru acelasi email se
        // raresc pana la refuz, indiferent de parola.
        const gate = await rateLimit("login", email);
        if (!gate.allowed) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });
        // doar staff activ, cu parola setata
        if (!user?.passwordHash || !user.active || !isStaff(user.role)) {
          return null;
        }
        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        // Autentificare reusita: bugetul se curata, ca greselile de dinainte
        // sa nu se adune peste sesiunile urmatoare.
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
      // `user` exista doar la sign-in; ulterior rolul ramane in token.
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
