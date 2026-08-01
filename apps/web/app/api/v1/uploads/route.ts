import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/auth/roles";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getActiveStore } from "@/lib/shop/store";
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
 * Încărcarea imaginilor de produs.
 *
 * Straturile de apărare, în ordine: autentificare + rol de admin, limitare de
 * rată, limită de număr si dimensiune, validarea semnăturii fiecărui fișier și
 * abia apoi scrierea în bucket, sub o cheie generată de server. Ștergerea e
 * limitată la obiectele magazinului propriu.
 */

/** Nu ne interesează cache-ul aici; fiecare încărcare e o scriere. */
export const dynamic = "force-dynamic";

interface AdminContext {
  userId: string;
  email: string | null;
  role: Role;
  storeId: string;
}

/**
 * Ca `requireAdmin`, dar pentru un route handler: întoarce răspuns HTTP în loc
 * de redirect, ca fetch-ul din interfață să primească un cod inteligibil.
 */
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

  const storeId = user.storeId ?? (await getActiveStore()).id;
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

  // 207: unele fișiere au trecut, altele nu — interfața le raportează separat.
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
  // Izolare între magazine: cheile încep cu id-ul magazinului care le-a creat.
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
