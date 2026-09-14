import { Client as MinioClient } from "minio";
import { getStorageConfig } from "../config/storage";
import { env } from "../env";

let _client: MinioClient | null = null;

export function getStorage(): MinioClient {
  if (_client) return _client;
  const config = getStorageConfig();
  _client = new MinioClient({
    endPoint: config.endPoint,
    port: config.port,
    useSSL: config.useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });
  return _client;
}

/**
 * A presigned URL is signed over its path and query, not its host, so the
 * origin can be swapped without breaking the signature. On-premise runs MinIO
 * embedded on 127.0.0.1, where the browser of a human cannot reach it; the
 * operator points MINIO_PUBLIC_URL at their reverse proxy and every presigned
 * URL is rewritten to it. A path on the public URL (https://host/minio) is
 * preserved so the proxy can route by prefix.
 */
export function rewritePresignedOrigin(url: string, publicUrl: string): string {
  let parsed: URL;
  let target: URL;
  try {
    parsed = new URL(url);
    target = new URL(publicUrl);
  } catch {
    return url;
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") return url;

  parsed.protocol = target.protocol;
  parsed.hostname = target.hostname;
  parsed.port = target.port;
  parsed.pathname = `${target.pathname.replace(/\/$/, "")}${parsed.pathname}`;
  return parsed.toString();
}

function withPublicOrigin(url: string): string {
  const publicUrl = env().MINIO_PUBLIC_URL;
  return publicUrl ? rewritePresignedOrigin(url, publicUrl) : url;
}

export async function ensureBucket(bucket: string) {
  const client = getStorage();
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket);
  }
}

export function getPresignedUrl(bucket: string, key: string, expirySeconds = 3600): Promise<string> {
  return getStorage().presignedGetObject(bucket, key, expirySeconds).then(withPublicOrigin);
}

export function getPresignedPutUrl(bucket: string, key: string, expirySeconds = 3600): Promise<string> {
  return getStorage().presignedPutObject(bucket, key, expirySeconds).then(withPublicOrigin);
}
