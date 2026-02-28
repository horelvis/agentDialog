import { env } from "../env";

export function getStorageConfig() {
  const e = env();
  return {
    endPoint: e.MINIO_ENDPOINT,
    port: e.MINIO_PORT,
    useSSL: e.MINIO_USE_SSL,
    accessKey: e.MINIO_ACCESS_KEY,
    secretKey: e.MINIO_SECRET_KEY,
    bucket: e.MINIO_BUCKET,
  };
}
