import type { Options } from "amqplib";
import { createChannel } from "./connection";
import { routing } from "./topology";
import { logger } from "../utils/logger";

const channel = createChannel();

/**
 * Helper to publish a persistent JSON message
 */
async function publishJson(
  exchange: string,
  rk: string,
  payload: unknown,
  opts: Options.Publish = {},
) {
  const content = Buffer.from(JSON.stringify(payload));
  await channel.publish(exchange, rk, content, {
    persistent: true,
    contentType: "application/json",
    ...opts,
  });
}

/**
 * Helper to send a persistent JSON message directly to a queue
 */
async function sendJson(
  queue: string,
  payload: unknown,
  opts: Options.Publish = {},
) {
  const content = Buffer.from(JSON.stringify(payload));
  await channel.sendToQueue(queue, content, {
    persistent: true,
    contentType: "application/json",
    ...opts,
  });
}

/**
 * Enqueue an order to deploy flow
 */
export async function enqueueDeploy(
  orderId: string,
  data: Record<string, unknown> = {},
) {
  await publishJson(
    routing.deploy.exchange,
    routing.deploy.rk,
    { orderId, ...data },
    { messageId: orderId },
  );
  logger.debug({ orderId }, "Published deploy job");
}

/**
 * Enqueue an order to settle flow
 */
export async function enqueueSettle(
  orderId: string,
  data: Record<string, unknown> = {},
) {
  await publishJson(
    routing.settle.exchange,
    routing.settle.rk,
    { orderId, ...data },
    { messageId: orderId },
  );
  logger.debug({ orderId }, "Published settle job");
}

/**
 * Enqueue a retry for deploy into a TTL queue by tier index (0..n)
 */
export async function enqueueDeployRetry(
  orderId: string,
  attempt: number,
  data: Record<string, unknown> = {},
) {
  const tiers = routing.deployRetryOrder;
  const idx = Math.min(attempt, tiers.length - 1);
  const queue = tiers[idx];
  if (!queue) {
    throw new Error(`No retry queue found for attempt ${attempt}`);
  }
  await sendJson(
    queue,
    { orderId, attempt, ...data },
    { messageId: `${orderId}:deploy:${attempt}` },
  );
  logger.warn({ orderId, attempt, queue }, "Published deploy retry");
}

/**
 * Enqueue a retry for settle into a TTL queue by tier index (0..n)
 */
export async function enqueueSettleRetry(
  orderId: string,
  attempt: number,
  data: Record<string, unknown> = {},
) {
  const tiers = routing.settleRetryOrder;
  const idx = Math.min(attempt, tiers.length - 1);
  const queue = tiers[idx];
  if (!queue) {
    throw new Error(`No settle retry queue found for attempt ${attempt}`);
  }
  await sendJson(
    queue,
    { orderId, attempt, ...data },
    { messageId: `${orderId}:settle:${attempt}` },
  );
  logger.warn({ orderId, attempt, queue }, "Published settle retry");
}

/**
 * Enqueue a residual (long delay) message by tier index (default first tier, 1h)
 */
export async function enqueueResidualDelay(
  orderId: string,
  tierIndex = 0,
  data: Record<string, unknown> = {},
) {
  const tiers = routing.residualOrder;
  const idx = Math.max(0, Math.min(tierIndex, tiers.length - 1));
  const queue = tiers[idx];
  if (!queue) {
    throw new Error(`No residual delay queue found for tier ${tierIndex}`);
  }
  await sendJson(
    queue,
    { orderId, tierIndex: idx, ...data },
    { messageId: `${orderId}:residual:${idx}` },
  );
  logger.info({ orderId, tierIndex: idx, queue }, "Published residual delay");
}
