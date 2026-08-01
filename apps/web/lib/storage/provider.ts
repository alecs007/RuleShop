/**
 * Interfața de stocare a fișierelor. Aplicația nu știe niciodată unde ajung
 * imaginile — la fel ca la plăți, implementarea se schimbă din variabile de
 * mediu, fără modificări în restul codului.
 */

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface ObjectBody {
  /** Conținutul, ca stream când driverul poate, altfel ca buffer. */
  body: ReadableStream<Uint8Array> | Uint8Array;
  contentType: string;
  size: number;
}

export interface StorageProvider {
  /** Numele driverului, pentru diagnostic si audit. */
  readonly name: string;
  put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredObject>;
  get(key: string): Promise<ObjectBody | null>;
  delete(key: string): Promise<void>;
}

/** URL-ul public al unui obiect — mereu prin aplicație, niciodată direct din bucket. */
export function mediaUrl(key: string): string {
  return `/api/v1/media/${key}`;
}

/** Cheia dintr-un URL de media, sau null dacă URL-ul nu e al nostru. */
export function keyFromMediaUrl(url: string): string | null {
  const prefix = "/api/v1/media/";
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
