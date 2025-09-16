import type { ConfirmChannel, Options } from "amqplib";
import { createChannel } from "./connection";
import { logger } from "../utils/logger";

// Exchange and queue names
export const EXCHANGES = {
  DIRECT: "orders.direct",
  DLX: "orders.dlx",
} as const;

export const ROUTING_KEYS = {
  DEPLOY: "deploy",
  SETTLE: "settle",
  DLQ: "dlq",
} as const;

export const QUEUES = {
  DEPLOY: "deploy.q",
  SETTLE: "settle.q",
  DLQ: "dlq.q",
  // retry tiers for transient errors
  DEPLOY_RETRY_1S: "deploy.retry.1s",
  DEPLOY_RETRY_5S: "deploy.retry.5s",
  DEPLOY_RETRY_30S: "deploy.retry.30s",
  DEPLOY_RETRY_2M: "deploy.retry.2m",
  DEPLOY_RETRY_10M: "deploy.retry.10m",
  SETTLE_RETRY_1S: "settle.retry.1s",
  SETTLE_RETRY_5S: "settle.retry.5s",
  SETTLE_RETRY_30S: "settle.retry.30s",
  SETTLE_RETRY_2M: "settle.retry.2m",
  SETTLE_RETRY_10M: "settle.retry.10m",
  // residual long-delays
  RESIDUAL_DELAY_1H: "residual.delay.1h",
  RESIDUAL_DELAY_3H: "residual.delay.3h",
  RESIDUAL_DELAY_6H: "residual.delay.6h",
  RESIDUAL_DELAY_12H: "residual.delay.12h",
  RESIDUAL_DELAY_24H: "residual.delay.24h",
} as const;

function ttlQueueArgs(ttlMs: number, rk: string): Options.AssertQueue {
  return {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": EXCHANGES.DIRECT,
      "x-dead-letter-routing-key": rk,
      "x-message-ttl": ttlMs,
    },
  };
}

function durableQueueArgs(dlxRoutingKey: string): Options.AssertQueue {
  return {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": EXCHANGES.DLX,
      "x-dead-letter-routing-key": dlxRoutingKey,
    },
  };
}

/**
 * Assert the full RabbitMQ topology: exchanges, queues, bindings.
 */
export async function assertTopology(): Promise<void> {
  const channel = createChannel(async (ch: ConfirmChannel) => {
    // Exchanges
    await ch.assertExchange(EXCHANGES.DIRECT, "direct", { durable: true });
    await ch.assertExchange(EXCHANGES.DLX, "direct", { durable: true });

    // Main queues with DLX to orders.dlx
    await ch.assertQueue(QUEUES.DEPLOY, durableQueueArgs(ROUTING_KEYS.DLQ));
    await ch.assertQueue(QUEUES.SETTLE, durableQueueArgs(ROUTING_KEYS.DLQ));
    await ch.assertQueue(QUEUES.DLQ, { durable: true });

    await ch.bindQueue(QUEUES.DEPLOY, EXCHANGES.DIRECT, ROUTING_KEYS.DEPLOY);
    await ch.bindQueue(QUEUES.SETTLE, EXCHANGES.DIRECT, ROUTING_KEYS.SETTLE);
    await ch.bindQueue(QUEUES.DLQ, EXCHANGES.DLX, ROUTING_KEYS.DLQ);

    // Retry tiers (no delayed plugin required)
    await ch.assertQueue(
      QUEUES.DEPLOY_RETRY_1S,
      ttlQueueArgs(1_000, ROUTING_KEYS.DEPLOY),
    );
    await ch.assertQueue(
      QUEUES.DEPLOY_RETRY_5S,
      ttlQueueArgs(5_000, ROUTING_KEYS.DEPLOY),
    );
    await ch.assertQueue(
      QUEUES.DEPLOY_RETRY_30S,
      ttlQueueArgs(30_000, ROUTING_KEYS.DEPLOY),
    );
    await ch.assertQueue(
      QUEUES.DEPLOY_RETRY_2M,
      ttlQueueArgs(120_000, ROUTING_KEYS.DEPLOY),
    );
    await ch.assertQueue(
      QUEUES.DEPLOY_RETRY_10M,
      ttlQueueArgs(600_000, ROUTING_KEYS.DEPLOY),
    );

    await ch.assertQueue(
      QUEUES.SETTLE_RETRY_1S,
      ttlQueueArgs(1_000, ROUTING_KEYS.SETTLE),
    );
    await ch.assertQueue(
      QUEUES.SETTLE_RETRY_5S,
      ttlQueueArgs(5_000, ROUTING_KEYS.SETTLE),
    );
    await ch.assertQueue(
      QUEUES.SETTLE_RETRY_30S,
      ttlQueueArgs(30_000, ROUTING_KEYS.SETTLE),
    );
    await ch.assertQueue(
      QUEUES.SETTLE_RETRY_2M,
      ttlQueueArgs(120_000, ROUTING_KEYS.SETTLE),
    );
    await ch.assertQueue(
      QUEUES.SETTLE_RETRY_10M,
      ttlQueueArgs(600_000, ROUTING_KEYS.SETTLE),
    );

    // Residual long-delay queues targeting deploy flow (re-check liquidity via normal flow)
    await ch.assertQueue(
      QUEUES.RESIDUAL_DELAY_1H,
      ttlQueueArgs(3_600_000, ROUTING_KEYS.DEPLOY),
    );
    await ch.assertQueue(
      QUEUES.RESIDUAL_DELAY_3H,
      ttlQueueArgs(10_800_000, ROUTING_KEYS.DEPLOY),
    );
    await ch.assertQueue(
      QUEUES.RESIDUAL_DELAY_6H,
      ttlQueueArgs(21_600_000, ROUTING_KEYS.DEPLOY),
    );
    await ch.assertQueue(
      QUEUES.RESIDUAL_DELAY_12H,
      ttlQueueArgs(43_200_000, ROUTING_KEYS.DEPLOY),
    );
    await ch.assertQueue(
      QUEUES.RESIDUAL_DELAY_24H,
      ttlQueueArgs(86_400_000, ROUTING_KEYS.DEPLOY),
    );
  });

  await channel.waitForConnect();
  logger.info("RabbitMQ topology asserted");
}

/**
 * Routing helpers for publishers.
 */
export const routing = {
  deploy: { exchange: EXCHANGES.DIRECT, rk: ROUTING_KEYS.DEPLOY },
  settle: { exchange: EXCHANGES.DIRECT, rk: ROUTING_KEYS.SETTLE },
  dlq: { exchange: EXCHANGES.DLX, rk: ROUTING_KEYS.DLQ },
  // retry queues are published to directly (no exchange), they will DLX back
  deployRetryOrder: [
    QUEUES.DEPLOY_RETRY_1S,
    QUEUES.DEPLOY_RETRY_5S,
    QUEUES.DEPLOY_RETRY_30S,
    QUEUES.DEPLOY_RETRY_2M,
    QUEUES.DEPLOY_RETRY_10M,
  ],
  settleRetryOrder: [
    QUEUES.SETTLE_RETRY_1S,
    QUEUES.SETTLE_RETRY_5S,
    QUEUES.SETTLE_RETRY_30S,
    QUEUES.SETTLE_RETRY_2M,
    QUEUES.SETTLE_RETRY_10M,
  ],
  residualOrder: [
    QUEUES.RESIDUAL_DELAY_1H,
    QUEUES.RESIDUAL_DELAY_3H,
    QUEUES.RESIDUAL_DELAY_6H,
    QUEUES.RESIDUAL_DELAY_12H,
    QUEUES.RESIDUAL_DELAY_24H,
  ],
} as const;
