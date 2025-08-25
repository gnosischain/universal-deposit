import { redis } from "../cache/redis";
import { logger } from "../utils/logger";

export type ServiceName =
  | "api"
  | "balance-watcher"
  | "deploy-worker"
  | "settle-worker";

/**
 * Key used for service heartbeat.
 */
export function heartbeatKey(service: ServiceName): string {
  return `hb:${service}`;
}

/**
 * Write a heartbeat record for a service with an expiry window.
 * If intervalMs is 30s, expiry will be 2 * intervalMs (60s).
 */
export async function writeHeartbeat(
  service: ServiceName,
  intervalMs = 30000,
): Promise<void> {
  const key = heartbeatKey(service);
  const now = new Date().toISOString();
  const ttlSeconds = Math.max(1, Math.floor((intervalMs * 2) / 1000));
  try {
    await redis.set(key, now, "EX", ttlSeconds);
  } catch (err) {
    logger.warn({ err, service }, "Failed to write heartbeat");
  }
}

/**
 * Starts a periodic heartbeat for a service.
 */
export function startHeartbeat(service: ServiceName, intervalMs = 30000): void {
  // Kick immediately
  void writeHeartbeat(service, intervalMs);
  setInterval(() => {
    void writeHeartbeat(service, intervalMs);
  }, intervalMs);
}

/**
 * Returns true if heartbeat key exists (i.e. last beat was within expiry window).
 * We rely on TTL expiry to determine freshness.
 */
export async function isHeartbeatFresh(service: ServiceName): Promise<boolean> {
  try {
    const exists = await redis.exists(heartbeatKey(service));
    return exists === 1;
  } catch {
    return false;
  }
}
