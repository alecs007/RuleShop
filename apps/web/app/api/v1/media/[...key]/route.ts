import { contentTypeForKey, getStorage, isValidObjectKey } from "@/lib/storage";

/**
 * Serves images from the bucket. The objects are not public: all traffic goes
 * through here and the key is validated first.
 *
 * The content type comes from the key's already-validated extension, not from
 * the object's metadata, and `nosniff` stops the browser reinterpreting it.
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
      // Keys carry a UUID, so a key's content never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      ...(object.size ? { "Content-Length": String(object.size) } : {}),
    },
  });
}
