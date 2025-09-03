import type { Address, Hex } from "viem";
import type { Channel, ConsumeMessage } from "amqplib";
import { logger } from "../utils/logger";
import { parseMessagePayload } from "../utils/message-parser";
import { createChannel } from "../queues/connection";
import { QUEUES } from "../queues/topology";
import { enqueueSettleRetry, enqueueResidualDelay } from "../queues/publishers";
import {
  getOrderById,
  updateOrderStatus,
} from "../database/repositories/orders.repo";
import {
  publicClientFor,
  getSourceUsdcAddress,
  getStargateUsdcAddress,
} from "../blockchain/utils";
import ERC20Abi from "../blockchain/contracts/ERC20.abi.json";
import UDAAbi from "../blockchain/contracts/UniversalDepositAccount.abi.json" with { type: "json" };
import { startHeartbeat } from "../monitoring/heartbeat";
import { walletClientFor } from "../blockchain/clients";
import { config } from "../config/env";

/**
 * SettleWorker (minimal stub consumer)
 * - Consume settle.q
 * - For order in DEPLOYED status:
 *   - Verify UDA still has non-zero balance
 *   - (Stub) Mark COMPLETED; later will: quote fees, simulate & call UDA.settle()
 *   - If balance is zero (race), ACK skip
 * - Retry with TTL tiers on transient errors
 * - For partial liquidity handling in future: schedule enqueueResidualDelay(orderId, tierIndex)
 */
export async function startSettleWorker(): Promise<void> {
  // Start heartbeat for this worker
  startHeartbeat("settle-worker", config.HEARTBEAT_INTERVAL_MS);

  const channel = createChannel();

  await channel.addSetup(async (ch: Channel) => {
    await ch.prefetch(3);

    await ch.consume(
      QUEUES.SETTLE,
      (msg: ConsumeMessage | null) => {
        void (async () => {
          if (!msg) return;
          try {
            // Parse message payload using utility function
            const payload = parseMessagePayload<{
              orderId: string;
              attempt?: number;
            }>(msg.content);
            if (!payload) {
              logger.error(
                "SettleWorker: failed to parse message payload, ack",
              );
              ch.ack(msg);
              return;
            }

            const order = await getOrderById(payload.orderId);
            if (!order) {
              logger.warn(
                { orderId: payload.orderId },
                "SettleWorker: order not found, ack",
              );
              ch.ack(msg);
              return;
            }

            if (order.status !== "DEPLOYED") {
              logger.debug(
                { orderId: payload.orderId, status: order.status },
                "SettleWorker: skip non-DEPLOYED",
              );
              ch.ack(msg);
              return;
            }

            // Verify source balance > 0 (basic sanity check)
            const client = publicClientFor(order.sourceChainId);
            const usdcSrc = getSourceUsdcAddress(order.sourceChainId);
            if (!usdcSrc) {
              await updateOrderStatus(order.id, "FAILED" as any, {
                message: "USDC source address not configured",
              });
              ch.ack(msg);
              return;
            }

            const balance = (await client.readContract({
              address: usdcSrc as Address,
              abi: ERC20Abi as any,
              functionName: "balanceOf",
              args: [order.universalAddress as Address],
            })) as bigint;

            if (balance === 0n) {
              logger.info(
                { orderId: order.id },
                "SettleWorker: zero balance, nothing to settle, ack",
              );

              await updateOrderStatus(order.id, "COMPLETED" as any, {
                message: "Zero balance at settlement time",
              });
              ch.ack(msg);
              return;
            }

            try {
              const wallet = walletClientFor(order.sourceChainId, "settler");
              if (!wallet) {
                throw new Error("No settlement wallet configured");
              }

              // Get Stargate USDC address for fee quoting
              const stargateUsdcSrc = getStargateUsdcAddress(
                order.sourceChainId,
              );
              if (!stargateUsdcSrc) {
                throw new Error("Stargate USDC source address not configured");
              }

              // Quote fee from UDA using Stargate USDC and slippage
              const feeQuote = (await client.readContract({
                address: order.universalAddress as Address,
                abi: UDAAbi as any,
                functionName: "quoteStargateFee",
                args: [
                  BigInt(order.amount.toString()),
                  stargateUsdcSrc as Address,
                  BigInt(config.SLIPPAGE_PERCENTAGE), // 0.5% = 500 basis points
                ],
              })) as [bigint, any, any];

              logger.info(
                { orderId: order.id, fee: feeQuote[0].toString() },
                "SettleWorker: obtained fee quote",
              );

              const fee = feeQuote[0]; // valueToSend

              // Simulate and send settle(sourceToken, maxSlippage) with value = fee
              const sim = await client.simulateContract({
                account: wallet.account,
                address: order.universalAddress as Address,
                abi: UDAAbi as any,
                functionName: "settle",
                args: [usdcSrc as Address, BigInt(config.SLIPPAGE_PERCENTAGE)],
                value: fee,
              });

              const txHash = (await wallet.writeContract(sim.request)) as Hex;
              const receipt = await client.waitForTransactionReceipt({
                hash: txHash,
              });

              await updateOrderStatus(order.id, "COMPLETED" as any, {
                transactionHash: txHash,
                bridgeTransactionUrl: `https://layerzeroscan.com/tx/${txHash}`,
                message: `Settlement executed in tx ${txHash} (block ${receipt.blockNumber})`,
              });

              logger.info(
                { orderId: order.id, txHash, amount: balance.toString() },
                "SettleWorker: settle executed",
              );
            } catch (settleErr) {
              // Retry with TTL tiers
              const attempt = (payload.attempt ?? 0) + 1;
              const maxAttempts = 5;
              if (attempt <= maxAttempts) {
                await enqueueSettleRetry(payload.orderId, attempt);
                logger.warn(
                  { orderId: payload.orderId, attempt, err: settleErr },
                  "SettleWorker: error during settle -> scheduled retry",
                );
              } else {
                await updateOrderStatus(payload.orderId, "FAILED" as any, {
                  message: "SettleWorker: retries exhausted during settle()",
                });
                await enqueueResidualDelay(payload.orderId, 0);
              }
              ch.ack(msg);
              return;
            }

            logger.info(
              { orderId: order.id, amount: balance.toString() },
              "SettleWorker: marked COMPLETED (stub)",
            );
            ch.ack(msg);
          } catch (err) {
            // Retry with TTL tiers
            try {
              const payload = parseMessagePayload<{
                orderId: string;
                attempt?: number;
              }>(msg.content);
              if (!payload) {
                logger.error(
                  "SettleWorker: failed to parse message payload in error handler, ack",
                );
                ch.ack(msg);
                return;
              }
              const attempt = (payload.attempt ?? 0) + 1;
              const maxAttempts = 5;
              if (attempt <= maxAttempts) {
                await enqueueSettleRetry(payload.orderId, attempt);
                logger.warn(
                  { orderId: payload.orderId, attempt },
                  "SettleWorker: error -> scheduled retry",
                );
              } else {
                await updateOrderStatus(payload.orderId, "FAILED" as any, {
                  message: "SettleWorker: retries exhausted",
                });
                // Optionally schedule residual reprocessing in future tiers
                await enqueueResidualDelay(payload.orderId, 0);
              }
            } catch (e) {
              logger.error({ err, e }, "SettleWorker: failed scheduling retry");
            } finally {
              ch.ack(msg);
            }
          }
        })();
      },
      { noAck: false },
    );
  });

  logger.info("SettleWorker started");
}
