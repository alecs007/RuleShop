import "server-only";
import { LocalStorage } from "./local";
import { S3Storage, s3ConfigFromEnv } from "./s3";
import type { StorageProvider } from "./provider";

export * from "./provider";
export * from "./validate";

let provider: StorageProvider | null = null;

/**
 * MinIO/S3 when configured, the local disk otherwise: uploads must keep
 * working when the storage container is not running.
 */
export function getStorage(): StorageProvider {
  if (provider) return provider;

  const config = s3ConfigFromEnv();
  provider = config ? new S3Storage(config) : new LocalStorage();
  return provider;
}
