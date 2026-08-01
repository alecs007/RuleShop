import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const SESSION_COOKIE = "rs_session";

/**
 * Identificator stabil de sesiune de cumparaturi (guest sau autentificat).
 * Pe el se leaga cosul si, ulterior, repartizarea canary determinista.
 */
export async function getSessionKey(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Ca mai sus, dar creeaza cookie-ul daca lipseste. De apelat DOAR din
 * server actions / route handlers (Next interzice scrierea cookie-urilor
 * in timpul randarii).
 */
export async function getOrCreateSessionKey(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const key = randomUUID();
  jar.set(SESSION_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 180, // 180 zile
    path: "/",
  });
  return key;
}
