import type { Address } from "viem";
import { logger } from "../utils/logger";
import { config } from "../config/env";
import {
  listUDAAddresses,
  getUDA,
  updateUDAState,
  pruneIndex,
} from "../cache/uda";
import { ensureOrder } from "../database/repositories/orders.repo";
import { ordersCreated } from "../monitoring/metrics";
import {
  publicClientFor,
  getSourceUsdcAddress,
  getDestinationUsdcAddress,
} from "../blockchain/utils";
import ERC20Abi from "../blockchain/contracts/ERC20.abi.json" with { type: "json" };
import UDAAbi from "../blockchain/contracts/UniversalDepositAccount.abi.json" with { type: "json" };
import { generateOrderId } from "../utils/id";
import { startHeartbeat } from "../monitoring/heartbeat";

/**
 * BalanceWatcher
 * - Poll active cached addresses (TTL not expired)
 * - Read USDC balance on source chain for each UDA
 * - If balance >= MIN_BRIDGE_AMOUNT:
 *    - Read UDA.nonce()
 *    - Compute deterministic orderId
 *    - Upsert (ensure) order in DB with status=CREATED
 *    - Enqueue deploy
 *    - Remove address from cache to avoid duplicates
 */

import { enqueueDeploy } from "../queues/publishers";

let running = false;

async function processAddress(address: string): Promise<void> {
  try {
    const rec = await getUDA(address);
    if (!rec) {
      // Hash expired; prune from index
      await pruneIndex(address);
      return;
    }

    const client = publicClientFor(rec.sourceChainId);
    const usdcSrc = getSourceUsdcAddress(rec.sourceChainId);
    const usdcDst = getDestinationUsdcAddress(rec.destinationChainId);
    if (!usdcSrc || !usdcDst) {
      logger.warn(
        {
          srcChainId: rec.sourceChainId,
          dstChainId: rec.destinationChainId,
          usdcSrc,
          usdcDst,
        },
        "BalanceWatcher: USDC address not configured for chain",
      );
      return;
    }

    // Read USDC balance of the UDA
    const balance = (await client.readContract({
      address: usdcSrc as Address,
      abi: ERC20Abi as any,
      functionName: "balanceOf",
      args: [rec.universalAddress as Address],
    })) as bigint;

    // Update last detected balance for observability
    await updateUDAState(rec.universalAddress, {
      lastDetectedBalance: balance,
    });

    if (balance < BigInt(config.MIN_BRIDGE_AMOUNT)) {
      logger.debug(
        {
          uda: rec.universalAddress,
          balance: balance.toString(),
          min: config.MIN_BRIDGE_AMOUNT,
        },
        "BalanceWatcher: balance below threshold",
      );
      return;
    }

    // Read on-chain UDA nonce
    const nonce = (await client.readContract({
      address: rec.universalAddress as Address,
      abi: UDAAbi as any,
      functionName: "nonce",
      args: [],
    })) as bigint;

    // Idempotency guard: skip if this nonce was already processed
    if (rec.lastProcessedNonce === nonce) {
      logger.debug(
        { uda: rec.universalAddress, nonce: nonce.toString() },
        "BalanceWatcher: nonce already processed, skipping",
      );
      return;
    }

    // Compute deterministic order id per spec
    const orderId = generateOrderId({
      universalAddress: rec.universalAddress,
      ownerAddress: rec.ownerAddress,
      recipientAddress: rec.recipientAddress,
      destinationTokenAddress: usdcDst,
      destinationChainId: rec.destinationChainId,
      nonce,
    });

    // Create (idempotent) order and enqueue for deployment
    await ensureOrder({
      id: orderId,
      universalAddress: rec.universalAddress,
      sourceChainId: rec.sourceChainId,
      destinationChainId: rec.destinationChainId,
      recipientAddress: rec.recipientAddress,
      sourceTokenAddress: usdcSrc,
      destinationTokenAddress: usdcDst,
      ownerAddress: rec.ownerAddress,
      nonce: Number(nonce),
      amount: balance,
      message: "Created from BalanceWatcher",
    });

    ordersCreated.inc();
    await enqueueDeploy(orderId);

    // Persist last processed nonce (do not delete cache; TTL will clear after 24h unless re-registered)
    await updateUDAState(rec.universalAddress, { lastProcessedNonce: nonce });

    logger.info(
      {
        uda: rec.universalAddress,
        orderId,
        nonce: nonce.toString(),
        amount: balance.toString(),
      },
      "BalanceWatcher: order created and enqueued",
    );
  } catch (err) {
    logger.error(
      { err, uda: address },
      "BalanceWatcher: error processing address",
    );
  }
}

async function processOnce() {
  const addrs = await listUDAAddresses();
  if (!addrs.length) {
    logger.debug("BalanceWatcher: no active cached addresses");
    return;
  }

  logger.info(
    { count: addrs.length },
    "BalanceWatcher: scanning cached addresses",
  );

  // Process all addresses concurrently using Promise.all
  await Promise.all(addrs.map(processAddress));
}

export async function startBalanceWatcher(): Promise<void> {
  logger.info(
    {
      intervalMs: config.BALANCE_CHECK_INTERVAL_MS,
      minAmount: config.MIN_BRIDGE_AMOUNT,
    },
    "BalanceWatcher starting",
  );
  startHeartbeat("balance-watcher", config.HEARTBEAT_INTERVAL_MS);

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await processOnce();
    } catch (err) {
      logger.error({ err }, "BalanceWatcher: tick error");
    } finally {
      running = false;
      setTimeout(() => {
        tick().catch((err) => {
          logger.error({ err }, "BalanceWatcher: tick scheduling error");
        });
      }, config.BALANCE_CHECK_INTERVAL_MS);
    }
  };

  // Kick off first tick
  tick().catch((err) => {
    logger.error({ err }, "BalanceWatcher: initial tick error");
  });
}
