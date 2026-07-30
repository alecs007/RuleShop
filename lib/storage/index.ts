import "server-only";
import { LocalStorage } from "./local";
import { S3Storage, s3ConfigFromEnv } from "./s3";
import type { StorageProvider } from "./provider";

export * from "./provider";
export * from "./validate";

let provider: StorageProvider | null = null;

/**
 * Driverul de stocare activ: MinIO/S3 dacă e configurat, altfel discul local.
 * Rezerva pe disc este intenționată — aplicația trebuie să poată încărca imagini
 * si când containerul de storage nu rulează.
 */
export function getStorage(): StorageProvider {
  if (provider) return provider;

  const config = s3ConfigFromEnv();
  provider = config ? new S3Storage(config) : new LocalStorage();
  return provider;
}
