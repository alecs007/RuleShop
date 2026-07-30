import "server-only";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectBody, StorageProvider, StoredObject } from "./provider";
import { isValidObjectKey } from "./validate";

export interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO nu suportă bucket-uri în subdomeniu — cere cale de tip path-style. */
  forcePathStyle: boolean;
}

/**
 * Driver S3: funcționează cu MinIO local (endpoint explicit, path-style) și, cu
 * exact același cod, cu S3/R2/Spaces în producție — se schimbă doar variabilele
 * de mediu.
 *
 * Obiectele rămân private: nu se generează URL-uri publice sau semnate, tot
 * traficul trece prin route handler-ul aplicației.
 */
export class S3Storage implements StorageProvider {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketReady: Promise<void> | null = null;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /** Creează bucket-ul la prima folosire, o singură dată per proces. */
  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        } catch (error) {
          // Poate exista deja (creat între timp de alt proces) — dacă nu,
          // eroarea reală apare oricum la prima operație.
          console.warn("[storage] nu am putut crea bucket-ul:", error);
        }
      }
    })();
    return this.bucketReady;
  }

  async put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredObject> {
    if (!isValidObjectKey(input.key)) throw new Error("Cheie de obiect invalidă.");
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return {
      key: input.key,
      size: input.body.byteLength,
      contentType: input.contentType,
    };
  }

  async get(key: string): Promise<ObjectBody | null> {
    if (!isValidObjectKey(key)) return null;
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) return null;
      return {
        body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>,
        contentType: result.ContentType ?? "application/octet-stream",
        size: result.ContentLength ?? 0,
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!isValidObjectKey(key)) throw new Error("Cheie de obiect invalidă.");
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

/** Configurația din variabile de mediu, sau null dacă nu e completă. */
export function s3ConfigFromEnv(): S3Config | null {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? "us-east-1",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}
