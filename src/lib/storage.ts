import { Client as MinioClient } from "minio";
import { getStorageConfig } from "../config/storage";

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

export async function ensureBucket(bucket: string) {
  const client = getStorage();
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket);
  }
}

export function getPresignedUrl(bucket: string, key: string, expirySeconds = 3600): Promise<string> {
  return getStorage().presignedGetObject(bucket, key, expirySeconds);
}

export function getPresignedPutUrl(bucket: string, key: string, expirySeconds = 3600): Promise<string> {
  return getStorage().presignedPutObject(bucket, key, expirySeconds);
}
