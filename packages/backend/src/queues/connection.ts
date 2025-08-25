import {
  connect,
  type AmqpConnectionManager,
  type ChannelWrapper,
} from "amqp-connection-manager";
import type { ConfirmChannel } from "amqplib";
import { config } from "../config/env";
import { logger } from "../utils/logger";

let conn: AmqpConnectionManager | null = null;

/**
 * Get (or create) a singleton AMQP connection.
 */
export function getAmqpConnection(): AmqpConnectionManager {
  if (conn) return conn;
  conn = connect([config.RABBITMQ_URL], {
    heartbeatIntervalInSeconds: 20,
    reconnectTimeInSeconds: 5,
  });

  conn.on("connect", () =>
    logger.info({ url: config.RABBITMQ_URL }, "RabbitMQ connected"),
  );
  conn.on("disconnect", (params) => {
    logger.warn(
      { err: params.err?.message },
      "RabbitMQ disconnected; will retry",
    );
  });

  return conn;
}

/**
 * Create a channel wrapper. You can pass a setup function to assert topology.
 */
export function createChannel(
  setup?: (ch: ConfirmChannel) => Promise<void>,
): ChannelWrapper {
  const manager = getAmqpConnection();
  const channel = manager.createChannel({
    json: true,
    setup,
  });
  channel.on("error", (err) => logger.error({ err }, "RabbitMQ channel error"));
  channel.on("connect", () => logger.info("RabbitMQ channel connected"));
  channel.on("close", () => logger.warn("RabbitMQ channel closed"));
  return channel;
}
