import { env } from "../env";

export function getRedisConfig() {
  const e = env();
  return {
    url: e.REDIS_URL,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
  };
}
