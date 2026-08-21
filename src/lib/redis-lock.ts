import { randomUUID } from "crypto";
import { getRedis } from "./redis";

/**
 * Run `fn` only if no one else holds `key`, and return null if someone does.
 *
 * The lock carries a random token and is released with a compare-and-delete, so
 * a holder that overran its TTL cannot delete the lock a later holder took. The
 * TTL is what keeps a crashed process from blocking the key forever, and it
 * should be comfortably longer than the work it guards.
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const redis = getRedis();
  const token = randomUUID();

  const acquired = await redis.set(key, token, "PX", ttlMs, "NX");
  if (acquired !== "OK") return null;

  try {
    return await fn();
  } finally {
    const releaseIfMine = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(releaseIfMine, 1, key, token).catch((err) => {
      console.error(`[LOCK] Could not release ${key}:`, err);
    });
  }
}
