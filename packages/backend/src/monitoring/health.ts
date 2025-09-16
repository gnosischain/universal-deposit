import type { FastifyInstance } from "fastify";
import { prisma } from "../database/client";
import { redis } from "../cache/redis";
import { createChannel } from "../queues/connection";
import { getPublicClient } from "../config/chains";
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

async function checkEduChain(): Promise<boolean> {
  try {
    const client = getPublicClient("edu");
    const n = await client.getBlockNumber();
    return typeof n === "bigint";
  } catch {
    return false;
  }
}

async function checkGnosisChain(): Promise<boolean> {
  try {
    const client = getPublicClient("gnosis");
    const n = await client.getBlockNumber();
    return typeof n === "bigint";
  } catch {
    return false;
  }
}

export async function getHealth(): Promise<HealthReport> {
  const [
    database,
    redisOk,
    rabbitmq,
    eduChain,
    gnosisChain,
    balanceWatcher,
    deployWorker,
    settleWorker,
  ] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkRabbitMQ(),
    checkEduChain(),
    checkGnosisChain(),
    isHeartbeatFresh("balance-watcher"),
    isHeartbeatFresh("deploy-worker"),
    isHeartbeatFresh("settle-worker"),
  ]);

  const connectivityOk = [
    database,
    redisOk,
    rabbitmq,
    eduChain,
    gnosisChain,
  ].filter(Boolean).length;
  const status: ServiceStatus =
    connectivityOk >= 4
      ? "healthy"
      : connectivityOk >= 2
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
    timestamp: new Date().toISOString(),
  };
}

export async function registerHealthRoute(app: FastifyInstance) {
  app.get("/api/v1/health", async () => {
    return getHealth();
  });
}
