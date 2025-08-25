import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Address } from "viem";
import { config } from "../../config/env";
import { ownerDailyKey, incrWithTtl } from "../../cache/redis";
import { registerOrRefreshUDA } from "../../cache/uda";
import { pickSourceNetwork } from "../../blockchain/clients";
import ProxyFactoryAbi from "../../blockchain/contracts/ProxyFactory.abi.json" with { type: "json" };

const RegisterAddressBody = z.object({
  ownerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid owner address"),
  recipientAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid recipient address"),
  destinationChainId: z.number().int().positive(),
  source: z.string().optional(),
});

const GetAddressQuery = RegisterAddressBody.omit({}).partial({}).extend({
  ownerAddress: RegisterAddressBody.shape.ownerAddress,
  recipientAddress: RegisterAddressBody.shape.recipientAddress,
  destinationChainId: RegisterAddressBody.shape.destinationChainId,
});

async function computeUniversalAddress(
  ownerAddress: Address,
  recipientAddress: Address,
  destinationChainId: bigint,
  source?: string,
): Promise<{ universalAddress: Address; sourceChainId: number }> {
  const { publicClient, proxyFactory, sourceChainId } =
    pickSourceNetwork(source);

  if (!proxyFactory) {
    throw new Error(
      "ProxyFactory address not configured for selected source chain",
    );
  }

  // viem read
  const universalAddress = (await publicClient.readContract({
    address: proxyFactory as Address,
    abi: ProxyFactoryAbi as any,
    functionName: "getUniversalAccount",
    args: [ownerAddress, recipientAddress, destinationChainId],
  })) as Address;

  return { universalAddress, sourceChainId };
}

export async function registerAddressesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST /api/v1/register-address
  app.post("/api/v1/register-address", async (req, reply) => {
    const parsed = RegisterAddressBody.safeParse(req.body);
    if (!parsed.success) {
      await reply
        .code(400)
        .send({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const { ownerAddress, recipientAddress, destinationChainId, source } =
      parsed.data;

    // Per-owner daily rate limit
    const todayKey = ownerDailyKey(ownerAddress, new Date().toISOString());
    const count = await incrWithTtl(todayKey, config.RATE_LIMIT_WINDOW_MS);
    if (count > config.RATE_LIMIT_MAX_REQUESTS) {
      await reply
        .code(429)
        .send({ error: "Rate limit exceeded: max requests per day reached" });
      return;
    }

    // Compute deterministic address via factory view
    const { universalAddress, sourceChainId } = await computeUniversalAddress(
      ownerAddress as Address,
      recipientAddress as Address,
      BigInt(destinationChainId),
      source,
    );

    // Cache address for watcher (24h TTL via Redis; TTL refreshed only on register)
    await registerOrRefreshUDA({
      universalAddress,
      ownerAddress,
      recipientAddress,
      destinationChainId,
      sourceChainId,
      ttlSeconds: 24 * 60 * 60,
    });

    await reply.send({ universalAddress });
  });

  // GET /api/v1/address
  app.get("/api/v1/address", async (req, reply) => {
    const parsed = GetAddressQuery.safeParse(req.query);
    if (!parsed.success) {
      await reply
        .code(400)
        .send({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const { ownerAddress, recipientAddress, destinationChainId, source } =
      parsed.data as any;

    const { universalAddress } = await computeUniversalAddress(
      ownerAddress as Address,
      recipientAddress as Address,
      BigInt(destinationChainId),
      source,
    );

    await reply.send({ universalAddress });
  });
}
