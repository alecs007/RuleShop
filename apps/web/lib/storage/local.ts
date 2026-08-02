import "server-only";
import { createReadStream } from "fs";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import type { ObjectBody, StorageProvider, StoredObject } from "./provider";
import { contentTypeForKey, isValidObjectKey } from "./validate";

/**
 * Fallback driver: files live on disk outside `public/`, so they are never
 * served directly — the media route handler validates the key first. Used when
 * MinIO/S3 is not configured, so the app works without a storage container.
 */
export class LocalStorage implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(root = process.env.UPLOAD_DIR ?? "storage/uploads") {
    this.root = path.resolve(process.cwd(), root);
  }

  /** We generate the keys, but check again: any path escaping the root is refused. */
  private resolve(key: string): string {
    if (!isValidObjectKey(key)) {
      throw new Error("Cheie de obiect invalidă.");
    }
    const target = path.resolve(this.root, key);
    const withinRoot =
      target === this.root || target.startsWith(this.root + path.sep);
    if (!withinRoot) throw new Error("Cheie de obiect invalidă.");
    return target;
  }

  async put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredObject> {
    const target = this.resolve(input.key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.body);
    return {
      key: input.key,
      size: input.body.byteLength,
      contentType: input.contentType,
    };
  }

  async get(key: string): Promise<ObjectBody | null> {
    const target = this.resolve(key);
    try {
      const info = await stat(target);
      if (!info.isFile()) return null;
      const stream = Readable.toWeb(
        createReadStream(target),
      ) as ReadableStream<Uint8Array>;
      return {
        body: stream,
        contentType: contentTypeForKey(key) ?? "application/octet-stream",
        size: info.size,
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
