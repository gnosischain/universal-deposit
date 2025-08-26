import { Prisma, OrderStatus } from "@prisma/client";
import { prisma } from "../client";

export type OrderKey = {
  universalAddress: string;
  sourceChainId: number;
  nonce: number;
};

export type CreateOrderInput = {
  id: string; // deterministic keccak preferred
  universalAddress: string;
  sourceChainId: number;
  destinationChainId: number;
  recipientAddress: string;
  sourceTokenAddress: string;
  destinationTokenAddress: string;
  ownerAddress: string;
  nonce: number;
  amount: bigint; // in token's smallest units (USDC 6dp)
  message?: string;
};

export async function getOrderById(id: string) {
  return prisma.order.findUnique({ where: { id } });
}

export async function getOrderByParams(key: OrderKey) {
  return prisma.order.findFirst({
    where: {
      universalAddress: key.universalAddress,
      sourceChainId: key.sourceChainId,
      nonce: key.nonce,
    },
  });
}

export async function listOrdersByUniversal(
  universalAddress: string,
  limit = 20,
) {
  return prisma.order.findMany({
    where: { universalAddress },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getOrderByIdWithClientFilter(
  id: string,
  clientId?: string,
) {
  const where: any = { id };
  if (clientId) {
    where.clientId = clientId;
  }
  return prisma.order.findUnique({ where });
}

export async function getOrderByParamsWithClientFilter(
  key: OrderKey,
  clientId?: string,
) {
  const where: any = {
    universalAddress: key.universalAddress,
    sourceChainId: key.sourceChainId,
    nonce: key.nonce,
  };
  if (clientId) {
    where.clientId = clientId;
  }
  return prisma.order.findFirst({ where });
}

export async function listOrdersByUniversalWithClientFilter(
  universalAddress: string,
  limit = 20,
  clientId?: string,
) {
  const where: any = { universalAddress };
  if (clientId) {
    where.clientId = clientId;
  }
  return prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function listAllOrdersWithClientFilter(
  limit = 20,
  clientId?: string,
) {
  const where: any = {};
  if (clientId) {
    where.clientId = clientId;
  }
  return prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Create an order record. Amount is stored as Prisma Decimal (NUMERIC(78,0)).
 * Throws on unique constraint conflict.
 */
export async function createOrder(input: CreateOrderInput) {
  return prisma.order.create({
    data: {
      id: input.id,
      universalAddress: input.universalAddress,
      sourceChainId: input.sourceChainId,
      destinationChainId: input.destinationChainId,
      recipientAddress: input.recipientAddress,
      sourceTokenAddress: input.sourceTokenAddress,
      destinationTokenAddress: input.destinationTokenAddress,
      ownerAddress: input.ownerAddress,
      nonce: input.nonce,
      amount: new Prisma.Decimal(input.amount.toString()),
      status: OrderStatus.CREATED,
      message: input.message,
    },
  });
}

/**
 * Idempotent create using unique composite (universalAddress, sourceChainId, nonce).
 * If already exists, returns the existing order.
 */
export async function ensureOrder(input: CreateOrderInput) {
  try {
    return await createOrder(input);
  } catch (e: any) {
    // P2002 = Unique constraint failed
    if (e?.code === "P2002") {
      const existing = await getOrderByParams({
        universalAddress: input.universalAddress,
        sourceChainId: input.sourceChainId,
        nonce: input.nonce,
      });
      if (existing) return existing;
    }
    throw e;
  }
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  patch?: {
    transactionHash?: string | null;
    bridgeTransactionUrl?: string | null;
    message?: string | null;
    retries?: number;
  },
) {
  return prisma.order.update({
    where: { id },
    data: {
      status,
      transactionHash: patch?.transactionHash,
      bridgeTransactionUrl: patch?.bridgeTransactionUrl,
      message: patch?.message,
      retries: patch?.retries,
    },
  });
}

/**
 * Find incomplete orders for recovery system
 * Returns orders that are not COMPLETED or FAILED
 */
export async function findIncompleteOrders(limit = 100) {
  return prisma.order.findMany({
    where: {
      status: {
        notIn: [OrderStatus.COMPLETED, OrderStatus.FAILED],
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
