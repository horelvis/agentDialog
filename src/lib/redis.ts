import Redis from "ioredis";
import { getRedisConfig } from "../config/redis";

let _redis: Redis | null = null;
let _sub: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;
  const config = getRedisConfig();
  _redis = new Redis(config.url, {
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    retryStrategy: config.retryStrategy,
  });
  return _redis;
}

export function getSubscriber(): Redis {
  if (_sub) return _sub;
  const config = getRedisConfig();
  _sub = new Redis(config.url, {
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    retryStrategy: config.retryStrategy,
  });
  return _sub;
}

export async function closeRedis() {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
  if (_sub) {
    await _sub.quit();
    _sub = null;
  }
}
