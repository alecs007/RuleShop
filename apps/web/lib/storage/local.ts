import "server-only";
import { createReadStream } from "fs";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import type { ObjectBody, StorageProvider, StoredObject } from "./provider";
import { contentTypeForKey, isValidObjectKey } from "./validate";

/**
 * Driver de rezervă: fișierele stau într-un folder de pe disc, în afara
 * `public/`, deci nu sunt servite direct de server — trec prin route handler-ul
 * de media, care le validează cheia. Folosit când MinIO/S3 nu e configurat, ca
 * aplicația să funcționeze si fără container de storage.
 */
export class LocalStorage implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(root = process.env.UPLOAD_DIR ?? "storage/uploads") {
    this.root = path.resolve(process.cwd(), root);
  }

  /**
   * Calea absolută a unei chei. Cheile sunt generate de noi, dar aici se
   * verifică din nou: orice cale care ar ieși din rădăcină e respinsă.
   */
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
