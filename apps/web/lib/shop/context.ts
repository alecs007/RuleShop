import "server-only";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export interface CustomerFacts {
  id: string | null;
  email: string | null;
  loyaltyTier: string;
  loyaltyPoints: number;
  completedOrders: number;
  lifetimeSpend: number;
  country: string | null;
  [key: string]: unknown;
}

export interface SessionFacts {
  isGuest: boolean;
  isAuthenticated: boolean;
  [key: string]: unknown;
}

/**
 * Faptele despre client si sesiune pentru contextul de evaluare al motorului.
 * Cache per request — o singura citire de DB indiferent cate produse se
 * evalueaza pe pagina.
 */
export const getEvaluationActor = cache(
  async (): Promise<{ customer: CustomerFacts; session: SessionFacts }> => {
    const session = await auth();

    if (!session?.user?.id) {
      return {
        customer: {
          id: null,
          email: null,
          loyaltyTier: "STANDARD",
          loyaltyPoints: 0,
          completedOrders: 0,
          lifetimeSpend: 0,
          country: null,
        },
        session: { isGuest: true, isAuthenticated: false },
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    const attributes = (user?.attributes ?? {}) as Record<string, unknown>;

    return {
      customer: {
        id: user?.id ?? null,
        email: user?.email ?? null,
        loyaltyTier: user?.loyaltyTier ?? "STANDARD",
        loyaltyPoints: user?.loyaltyPoints ?? 0,
        completedOrders: user?.completedOrders ?? 0,
        lifetimeSpend: user?.lifetimeSpend ?? 0,
        country: typeof attributes.country === "string" ? attributes.country : null,
        ...attributes,
      },
      session: { isGuest: !user, isAuthenticated: !!user },
    };
  },
);
