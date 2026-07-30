import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * Healthcheck public.
 *
 * Intoarce 200 cat timp aplicatia raspunde, cu starea bazei de date ca
 * diagnostic. Detaliul erorii NU ajunge in raspuns: mesajele Prisma pot
 * conține connection string-ul (deci si parola), iar endpointul este
 * neautentificat. Cauza reala se vede in logurile serverului.
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
