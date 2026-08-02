/**
 * The file storage interface. As with payments, the implementation is chosen
 * from the environment and the rest of the code never knows the difference.
 */

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface ObjectBody {
  /** A stream where the driver can, a buffer otherwise. */
  body: ReadableStream<Uint8Array> | Uint8Array;
  contentType: string;
  size: number;
}

export interface StorageProvider {
  /** The driver's name, for diagnostics and audit. */
  readonly name: string;
  put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredObject>;
  get(key: string): Promise<ObjectBody | null>;
  delete(key: string): Promise<void>;
}

/** Always through the app, never straight from the bucket. */
export function mediaUrl(key: string): string {
  return `/api/v1/media/${key}`;
}

/** The key inside a media URL, or null if the URL is not ours. */
export function keyFromMediaUrl(url: string): string | null {
  const prefix = "/api/v1/media/";
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
