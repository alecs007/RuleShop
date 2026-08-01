import { contentTypeForKey, getStorage, isValidObjectKey } from "@/lib/storage";

/**
 * Servirea imaginilor din bucket. Obiectele nu sunt publice: nimeni nu vorbește
 * direct cu MinIO/S3, tot traficul trece prin acest handler, care validează
 * cheia înainte de orice acces.
 *
 * Tipul de conținut se stabilește din extensia (deja validată a) cheii, nu din
 * metadatele obiectului, iar `nosniff` împiedică browserul să reinterpreteze
 * conținutul ca altceva decât o imagine.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;
  const key = segments.join("/");

  const contentType = contentTypeForKey(key);
  if (!isValidObjectKey(key) || !contentType) {
    return new Response("Cheie invalidă", { status: 400 });
  }

  const object = await getStorage().get(key);
  if (!object) {
    return new Response("Imaginea nu există", { status: 404 });
  }

  return new Response(object.body as BodyInit, {
    headers: {
      "Content-Type": contentType,
      // Cheile conțin un UUID, deci conținutul unei chei nu se schimbă niciodată.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      ...(object.size ? { "Content-Length": String(object.size) } : {}),
    },
  });
}
