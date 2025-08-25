import { Redis } from "ioredis";
import { config } from "../config/env.js";

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: false,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

/**
 * Per-owner daily limiter key helper
 */
export function ownerDailyKey(ownerAddress: string, dateISO: string) {
  return `rl:v1:register:owner:${ownerAddress}:${dateISO.slice(0, 10).replace(/-/g, "")}`;
}

/**
 * Increment rate limit counter with TTL if new.
 * Returns the new count.
 */
export async function incrWithTtl(key: string, ttlMs: number): Promise<number> {
  const pipeline = redis.multi();
  pipeline.incr(key);
  pipeline.pexpire(key, ttlMs, "NX");
  const [incrRes] = (await pipeline.exec()) as [
    [null, number],
    [null, number | null],
  ];
  return incrRes[1];
}
