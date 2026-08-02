import "server-only";
import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/auth/roles";
import { getFallbackAdminStore } from "@/lib/shop/store";

/**
 * Two ways in, both checked on the server: a staff session, or the service
 * token used by the MCP server (with `?store=<slug>` picking the store). The
 * token is compared in constant time and never appears in a response.
 */

export interface ApiActor {
  id: string;
  email: string | null;
  storeId: string;
  /** true when the request came with the service token. */
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
  // 1) Service token (MCP).
  const apiKey = request.headers.get("x-api-key");
  const expected = process.env.MCP_API_TOKEN;
  if (apiKey) {
    if (!expected || !tokenMatches(apiKey, expected)) {
      return NextResponse.json({ error: "Token invalid." }, { status: 401 });
    }
    const slug = request.nextUrl.searchParams.get("store");
    const store = slug
      ? await prisma.store.findUnique({ where: { slug } })
      : await getFallbackAdminStore();
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

  // 2) Staff session with admin rights.
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 401 });
  }
  const storeId = user.storeId ?? (await getFallbackAdminStore()).id;
  return { id: user.id, email: user.email, storeId, service: false };
}
