import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * Public healthcheck. Returns 200 while the app answers, with the database
 * state as a diagnostic. The error detail is deliberately left out: Prisma
 * messages can carry the connection string, password included, and this
 * endpoint is unauthenticated. The real cause is in the server logs.
 */
export async function GET() {
  let database: "ok" | "unavailable" = "ok";
  try {
    await prisma.store.count();
  } catch (error) {
    database = "unavailable";
    console.error("[health] baza de date nu răspunde:", error);
  }

  return NextResponse.json(
    { status: "ok", database, timestamp: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
