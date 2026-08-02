import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const SESSION_COOKIE = "rs_session";

/**
 * A stable shopping-session id, guest or signed in. The cart hangs off it, and
 * so does the deterministic canary assignment.
 */
export async function getSessionKey(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** Creates the cookie if missing. Server actions and route handlers only. */
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
