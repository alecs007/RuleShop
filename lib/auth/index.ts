import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
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
