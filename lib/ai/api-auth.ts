import "server-only";
import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/auth/roles";
import { getActiveStore } from "@/lib/shop/store";

/**
 * Autorizarea API-ului /api/v1/ai — doua cai, ambele verificate pe server:
 *  1. sesiune de staff (aceleasi conturi ca in control plane);
 *  2. token de serviciu (`x-api-key` == MCP_API_TOKEN) — folosit de serverul
 *     MCP propriu; magazinul se alege prin `?store=<slug>`.
 * Tokenul se compara in timp constant si nu apare niciodata in raspunsuri.
 */

export interface ApiActor {
  id: string;
  email: string | null;
  storeId: string;
  /** true cand cererea vine cu tokenul de serviciu (MCP). */
  service: boolean;
}

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authorizeAiApi(
  request: NextRequest,
): Promise<ApiActor | NextResponse> {
  // 1) Token de serviciu (MCP).
  const apiKey = request.headers.get("x-api-key");
  const expected = process.env.MCP_API_TOKEN;
  if (apiKey) {
    if (!expected || !tokenMatches(apiKey, expected)) {
      return NextResponse.json({ error: "Token invalid." }, { status: 401 });
    }
    const slug = request.nextUrl.searchParams.get("store");
    const store = slug
      ? await prisma.store.findUnique({ where: { slug } })
      : await getActiveStore();
    if (!store) {
      return NextResponse.json({ error: "Magazin necunoscut." }, { status: 404 });
    }
    return {
      id: "mcp-service",
      email: "mcp@ruleshop.local",
      storeId: store.id,
      service: true,
    };
  }

  // 2) Sesiune de staff cu drepturi de admin.
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 401 });
  }
  const storeId = user.storeId ?? (await getActiveStore()).id;
  return { id: user.id, email: user.email, storeId, service: false };
}
