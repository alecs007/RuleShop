import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/auth/roles";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getFallbackAdminStore } from "@/lib/shop/store";
import {
  buildObjectKey,
  getStorage,
  isValidObjectKey,
  keyFromMediaUrl,
  mediaUrl,
  MAX_FILES_PER_REQUEST,
  validateImage,
} from "@/lib/storage";

/**
 * Product image upload. The layers, in order: admin role, rate limit, count
 * and size caps, per-file signature validation, and only then a write to the
 * bucket under a server-generated key. Deletion is limited to the store's own
 * objects.
 */

/** No caching here: every upload is a write. */
export const dynamic = "force-dynamic";

interface AdminContext {
  userId: string;
  email: string | null;
  role: Role;
  storeId: string;
}

/** Like `requireAdmin`, but answers with a status code instead of a redirect. */
async function authorize(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Autentificare necesară." },
        { status: 401 },
      ),
    };
  }
  if (!isAdmin(user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Drepturi insuficiente." },
        { status: 403 },
      ),
    };
  }

  const storeId = user.storeId ?? (await getFallbackAdminStore()).id;
  return {
    ok: true,
    ctx: { userId: user.id, email: user.email, role: user.role, storeId },
  };
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const limit = await rateLimit("uploads", ctx.userId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Prea multe încărcări. Încearcă din nou într-un minut." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Cerere invalidă (se aștepta multipart/form-data)." },
      { status: 400 },
    );
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Niciun fișier trimis." }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES_PER_REQUEST} imagini per încărcare.` },
      { status: 413 },
    );
  }

  const storage = getStorage();
  const uploaded: { key: string; url: string; size: number; type: string }[] = [];
  const rejected: { name: string; error: string }[] = [];

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateImage({
      size: file.size,
      declaredType: file.type,
      bytes,
    });
    if (!validation.ok) {
      rejected.push({ name: file.name, error: validation.error });
      continue;
    }

    const key = buildObjectKey({
      storeId: ctx.storeId,
      extension: validation.extension,
      uuid: randomUUID(),
    });

    try {
      const stored = await storage.put({
        key,
        body: bytes,
        contentType: validation.type,
      });
      uploaded.push({
        key: stored.key,
        url: mediaUrl(stored.key),
        size: stored.size,
        type: stored.contentType,
      });
    } catch (error) {
      console.error("[uploads] scrierea a eșuat:", error);
      rejected.push({ name: file.name, error: "Stocarea a eșuat." });
    }
  }

  if (uploaded.length > 0) {
    await logAudit({
      storeId: ctx.storeId,
      action: "STORE_SETTINGS_UPDATED",
      entityType: "Media",
      actorId: ctx.userId,
      actorEmail: ctx.email,
      actorRole: ctx.role,
      after: { uploaded: uploaded.map((u) => u.key), driver: storage.name },
      metadata: { rejected },
    });
  }

  // 207: some files made it and some did not; the UI reports them apart.
  const status = rejected.length === 0 ? 201 : uploaded.length > 0 ? 207 : 400;
  return NextResponse.json({ uploaded, rejected }, { status });
}

export async function DELETE(request: Request) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const raw = new URL(request.url).searchParams.get("key") ?? "";
  const key = keyFromMediaUrl(raw) ?? raw;

  if (!isValidObjectKey(key)) {
    return NextResponse.json({ error: "Cheie invalidă." }, { status: 400 });
  }
  // Store isolation: keys start with the id of the store that created them.
  if (!key.startsWith(`${ctx.storeId}/`)) {
    return NextResponse.json(
      { error: "Obiectul nu aparține acestui magazin." },
      { status: 403 },
    );
  }

  try {
    await getStorage().delete(key);
  } catch (error) {
    console.error("[uploads] ștergerea a eșuat:", error);
    return NextResponse.json({ error: "Ștergerea a eșuat." }, { status: 500 });
  }

  return NextResponse.json({ deleted: key });
}
