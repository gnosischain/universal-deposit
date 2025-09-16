import { logger } from "../utils/logger";
import { findIncompleteOrders } from "../database/repositories/orders.repo";
import { enqueueDeploy, enqueueSettle } from "../queues/publishers";
import { OrderStatus } from "@prisma/client";

/**
 * Recovery Service
 * - On startup, find all incomplete orders
 * - Resume processing from where they left off
 * - CREATED orders go to deploy queue
 * - DEPLOYED orders go to settle queue
 */

export async function runRecovery(): Promise<void> {
  logger.info("Recovery: Starting recovery process");

  try {
    const incompleteOrders = await findIncompleteOrders();

    if (incompleteOrders.length === 0) {
      logger.info("Recovery: No incomplete orders found");
      return;
    }

    logger.info(
      { count: incompleteOrders.length },
      "Recovery: Found incomplete orders",
    );

    let deployCount = 0;
    let settleCount = 0;

    for (const order of incompleteOrders) {
      try {
        switch (order.status) {
          case OrderStatus.CREATED:
            await enqueueDeploy(order.id);
            deployCount++;
            logger.debug(
              { orderId: order.id },
              "Recovery: Enqueued order for deployment",
            );
            break;

          case OrderStatus.DEPLOYED:
            await enqueueSettle(order.id);
            settleCount++;
            logger.debug(
              { orderId: order.id },
              "Recovery: Enqueued order for settlement",
            );
            break;

          default:
            logger.warn(
              { orderId: order.id, status: order.status },
              "Recovery: Unknown order status, skipping",
            );
            break;
        }
      } catch (err) {
        logger.error(
          { err, orderId: order.id },
          "Recovery: Failed to enqueue order",
        );
      }
    }

    logger.info(
      { deployCount, settleCount, total: incompleteOrders.length },
      "Recovery: Completed recovery process",
    );
  } catch (err) {
    logger.error({ err }, "Recovery: Failed to run recovery process");
    throw err;
  }
}
