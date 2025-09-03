import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from "prom-client";

// Central registry
export const registry = new Registry();

// Collect default metrics with error handling to prevent hanging
try {
  collectDefaultMetrics({
    register: registry,
    prefix: "ud_",
  });
} catch (error) {
  console.warn("Failed to collect default metrics:", error);
}

// Order metrics
export const ordersCreated = new Counter({
  name: "ud_orders_created_total",
  help: "Total number of orders created",
  registers: [registry],
});

export const ordersCompleted = new Counter({
  name: "ud_orders_completed_total",
  help: "Total number of orders completed",
  registers: [registry],
});

export const ordersFailed = new Counter({
  name: "ud_orders_failed_total",
  help: "Total number of orders failed",
  registers: [registry],
  labelNames: ["reason"] as const,
});

// Processing time
export const orderProcessingSeconds = new Histogram({
  name: "ud_order_processing_seconds",
  help: "Histogram of order processing duration in seconds",
  registers: [registry],
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
});

// Queues
export const queueSize = new Gauge({
  name: "ud_queue_size",
  help: "Current size of a queue",
  registers: [registry],
  labelNames: ["queue"] as const,
});

export const residualBackoffLevel = new Gauge({
  name: "ud_residual_backoff_level",
  help: "Residual backoff tier (e.g., 0..n)",
  registers: [registry],
});

/**
 * Registers the /metrics endpoint on the provided Fastify instance.
 */
export async function registerMetricsRoute(
  app: FastifyInstance,
): Promise<void> {
  app.get("/metrics", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await reply.header("Content-Type", registry.contentType);

      // Add timeout to prevent hanging
      const metricsPromise = Promise.resolve(registry.metrics());
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(
          () => reject(new Error("Metrics collection timeout")),
          10000,
        );
      });

      const metrics = await Promise.race([metricsPromise, timeoutPromise]);
      return metrics;
    } catch (error) {
      console.error("Error collecting metrics:", error);
      await reply.code(500).send({ error: "Failed to collect metrics" });
    }
  });
}
