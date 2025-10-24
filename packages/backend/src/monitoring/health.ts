import type { FastifyInstance } from "fastify";
import { prisma } from "../database/client";
import { redis } from "../cache/redis";
import { createChannel } from "../queues/connection";
import { getPublicClient, getRegistry } from "../config/chains";
import { isHeartbeatFresh } from "./heartbeat";

export type ServiceStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthReport {
  status: ServiceStatus;
  services: {
    database: boolean;
    redis: boolean;
    rabbitmq: boolean;
    eduChain: boolean;
    gnosisChain: boolean;
    balanceWatcher: boolean;
    deployWorker: boolean;
    settleWorker: boolean;
  };
  chains: Record<string, boolean>;
  timestamp: string;
}

async function checkDatabase(): Promise<boolean> {
  try {
    // Simple connectivity probe
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    const res = await redis.ping();
    return res === "PONG";
  } catch {
    return false;
  }
}

async function checkRabbitMQ(): Promise<boolean> {
  try {
    // Attempt to open a channel and wait for connectivity
    const ch = createChannel();
    await ch.waitForConnect();
    await ch.close();
    return true;
  } catch {
    return false;
  }
}

async function checkAllChains(): Promise<Record<string, boolean>> {
  try {
    const reg = getRegistry();
    const results = await Promise.all(
      reg.chains.map(async (entry) => {
        try {
          const client = getPublicClient(entry.key);
          const n = await client.getBlockNumber();
          return [entry.key, typeof n === "bigint"] as const;
        } catch {
          return [entry.key, false] as const;
        }
      }),
    );
    return Object.fromEntries(results);
  } catch {
    return {};
  }
}

export async function getHealth(): Promise<HealthReport> {
  const [
    database,
    redisOk,
    rabbitmq,
    chains,
    balanceWatcher,
    deployWorker,
    settleWorker,
  ] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkRabbitMQ(),
    checkAllChains(),
    isHeartbeatFresh("balance-watcher"),
    isHeartbeatFresh("deploy-worker"),
    isHeartbeatFresh("settle-worker"),
  ]);

  const eduChain = chains["edu"] ?? false;
  const gnosisChain = chains["gnosis"] ?? false;

  const core = [database, redisOk, rabbitmq];
  const chainStatuses = Object.values(chains);
  const totalItems = core.length + chainStatuses.length;
  const connectivityOk = [...core, ...chainStatuses].filter(Boolean).length;

  const status: ServiceStatus =
    connectivityOk >= totalItems - 1
      ? "healthy"
      : connectivityOk >= Math.ceil(totalItems / 2)
        ? "degraded"
        : "unhealthy";

  return {
    status,
    services: {
      database,
      redis: redisOk,
      rabbitmq,
      eduChain,
      gnosisChain,
      balanceWatcher,
      deployWorker,
      settleWorker,
    },
    chains,
    timestamp: new Date().toISOString(),
  };
}

export async function registerHealthRoute(app: FastifyInstance) {
  app.get("/api/v1/health", async () => {
    return getHealth();
  });
}
