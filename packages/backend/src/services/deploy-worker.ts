import type { Address, Hex } from "viem";
import type { Channel, ConsumeMessage } from "amqplib";
import { logger } from "../utils/logger";
import { createChannel } from "../queues/connection";
import { QUEUES } from "../queues/topology";
import { enqueueSettle, enqueueDeployRetry } from "../queues/publishers";
import {
  getOrderById,
  updateOrderStatus,
} from "../database/repositories/orders.repo";
import { publicClientFor, getProxyFactoryAddress } from "../blockchain/utils";
import { startHeartbeat } from "../monitoring/heartbeat";
import { walletClientFor } from "../blockchain/clients";
import ProxyFactoryAbi from "../blockchain/contracts/ProxyFactory.abi.json" with { type: "json" };

/**
 * DeployWorker
 * - Consume deploy.q
 * - If order status = CREATED:
 *   - Check if universalAddress bytecode exists on source chain
 *   - If deployed -> mark DEPLOYED and enqueue settle
 *   - If not deployed -> retry with TTL tiers (actual deployment call can be added once keys/contracts are wired)
 * - Otherwise ack and skip
 */
export async function startDeployWorker(): Promise<void> {
  // Start heartbeat for this worker (30s interval)
  startHeartbeat("deploy-worker", 30000);

  const channel = createChannel();

  await channel.addSetup(async (ch: Channel) => {
    await ch.prefetch(2);

    await ch.consume(
      QUEUES.DEPLOY,
      (msg: ConsumeMessage | null) => {
        void (async () => {
          if (!msg) return;
          try {
            const payload = JSON.parse(msg.content.toString()) as {
              orderId: string;
              attempt?: number;
            };

            const order = await getOrderById(payload.orderId);
            if (!order) {
              logger.warn(
                { orderId: payload.orderId },
                "DeployWorker: order not found, ack",
              );
              ch.ack(msg);
              return;
            }

            if (order.status !== "CREATED") {
              logger.debug(
                { orderId: payload.orderId, status: order.status },
                "DeployWorker: skip non-CREATED",
              );
              ch.ack(msg);
              return;
            }

            // Check if UDA is already deployed
            const client = publicClientFor(order.sourceChainId);
            const bytecode = (await client.getBytecode({
              address: order.universalAddress as Address,
            })) as Hex | null;

            const isDeployed = bytecode != null && bytecode !== "0x";
            if (isDeployed) {
              await updateOrderStatus(order.id, "DEPLOYED" as any);
              await enqueueSettle(order.id);
              logger.info(
                { orderId: order.id, uda: order.universalAddress },
                "DeployWorker: marked DEPLOYED -> enqueued settle",
              );
              ch.ack(msg);
              return;
            }

            try {
              const factory = getProxyFactoryAddress(order.sourceChainId);
              const wallet = walletClientFor(order.sourceChainId, "deployer");
              if (!factory || !wallet) {
                logger.warn(
                  {
                    orderId: order.id,
                    factory,
                    hasWallet: !!wallet,
                    chainId: order.sourceChainId,
                  },
                  "DeployWorker: missing factory or wallet; falling back to retry",
                );
                const attempt = (payload.attempt ?? 0) + 1;
                const maxAttempts = 5;
                if (attempt <= maxAttempts) {
                  await enqueueDeployRetry(order.id, attempt);
                } else {
                  await updateOrderStatus(order.id, "FAILED" as any, {
                    message:
                      "UDA not deployed after retries (no factory/wallet)",
                  });
                }
                ch.ack(msg);
                return;
              }

              // Simulate & send createUniversalAccount(owner, recipient, destinationChainId)
              const sim = await client.simulateContract({
                account: wallet.account,
                address: factory as Address,
                abi: ProxyFactoryAbi as any,
                functionName: "createUniversalAccount",
                args: [
                  order.ownerAddress as Address,
                  order.recipientAddress as Address,
                  BigInt(order.destinationChainId),
                ],
              });

              const txHash = (await wallet.writeContract(sim.request)) as Hex;
              const receipt = await client.waitForTransactionReceipt({
                hash: txHash,
              });

              // Verify deployment
              const postBytecode = (await client.getBytecode({
                address: order.universalAddress as Address,
              })) as Hex | null;

              const deployedNow = postBytecode != null && postBytecode !== "0x";
              if (deployedNow) {
                await updateOrderStatus(order.id, "DEPLOYED" as any, {
                  transactionHash: txHash,
                  message: `Proxy deployed in tx ${txHash}`,
                });
                await enqueueSettle(order.id);
                logger.info(
                  {
                    orderId: order.id,
                    uda: order.universalAddress,
                    txHash,
                    blockNumber: receipt.blockNumber,
                  },
                  "DeployWorker: deployed UDA -> enqueued settle",
                );
                ch.ack(msg);
                return;
              }

              // Fallback if for some reason deployment not visible yet
              const attempt = (payload.attempt ?? 0) + 1;
              const maxAttempts = 5;
              if (attempt <= maxAttempts) {
                await enqueueDeployRetry(order.id, attempt);
                logger.warn(
                  { orderId: order.id, attempt },
                  "DeployWorker: post-deploy verification pending; scheduled retry",
                );
              } else {
                await updateOrderStatus(order.id, "FAILED" as any, {
                  message: "UDA not deployed after on-chain attempt + retries",
                });
              }
              ch.ack(msg);
              return;
            } catch (deployErr) {
              logger.error(
                { orderId: order.id, err: deployErr },
                "DeployWorker: deployment error; scheduling retry",
              );
              const attempt = (payload.attempt ?? 0) + 1;
              const maxAttempts = 5;
              if (attempt <= maxAttempts) {
                await enqueueDeployRetry(order.id, attempt);
              } else {
                await updateOrderStatus(order.id, "FAILED" as any, {
                  message:
                    "UDA not deployed after deployment errors and retries",
                });
              }
              ch.ack(msg);
              return;
            }
          } catch (err) {
            logger.error(
              { err },
              "DeployWorker: handler error, ack to avoid poison",
            );
            ch.ack(msg);
          }
        })();
      },
      { noAck: false },
    );
  });

  logger.info("DeployWorker started");
}
