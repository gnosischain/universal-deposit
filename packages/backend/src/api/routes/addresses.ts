import type { FastifyInstance } from "fastify";
import type { Address } from "viem";
import { config } from "../../config/env";
import { ownerDailyKey, incrWithTtl } from "../../cache/redis";
import { registerOrRefreshUDA } from "../../cache/uda";
import { pickSourceNetwork } from "../../blockchain/clients";
import { type AuthenticatedRequest } from "../../middleware/auth";
import ProxyFactoryAbi from "../../blockchain/contracts/ProxyFactory.abi.json" with { type: "json" };
import {
  RegisterAddressBody,
  GetAddressQuery,
  addressesSchemas,
} from "../schemas/addresses";
import { validateRoute } from "../../utils/route-validation";

async function computeUniversalAddress(
  ownerAddress: Address,
  recipientAddress: Address,
  destinationChainId: bigint,
  sourceChainId: number,
): Promise<{ universalAddress: Address; sourceChainId: number }> {
  const { publicClient, proxyFactory } = pickSourceNetwork(sourceChainId);

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
  app.post(
    "/api/v1/register-address",
    { schema: addressesSchemas.registerAddress },
    async (req: AuthenticatedRequest, reply) => {
      const parsed = RegisterAddressBody.safeParse(req.body);
      if (!parsed.success) {
        await reply
          .code(400)
          .send({ error: "Invalid body", details: parsed.error.flatten() });
        return;
      }
      const {
        ownerAddress,
        recipientAddress,
        destinationChainId,
        sourceChainId,
      } = parsed.data;

      // Validate route configuration
      const routeValidation = validateRoute(sourceChainId, destinationChainId);
      if (!routeValidation.isValid) {
        await reply.code(400).send({
          error: "Invalid route",
          code: routeValidation.error?.code,
          message: routeValidation.error?.message,
          details: routeValidation.error?.details,
        });
        return;
      }

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
      const { universalAddress } = await computeUniversalAddress(
        ownerAddress as Address,
        recipientAddress as Address,
        BigInt(destinationChainId),
        sourceChainId,
      );

      // Cache address for watcher (24h TTL via Redis; TTL refreshed only on register)
      await registerOrRefreshUDA({
        universalAddress,
        ownerAddress,
        recipientAddress,
        destinationChainId,
        sourceChainId,
        ttlSeconds: 24 * 60 * 60,
        clientId: req.client?.id, // Associate with the authenticated client
      });

      await reply.send({ universalAddress });
    },
  );

  // GET /api/v1/address
  app.get(
    "/api/v1/address",
    { schema: addressesSchemas.getAddress },
    async (req: AuthenticatedRequest, reply) => {
      const parsed = GetAddressQuery.safeParse(req.query);
      if (!parsed.success) {
        await reply
          .code(400)
          .send({ error: "Invalid query", details: parsed.error.flatten() });
        return;
      }
      const {
        ownerAddress,
        recipientAddress,
        destinationChainId,
        sourceChainId,
      } = parsed.data;

      // Validate route configuration
      const routeValidation = validateRoute(sourceChainId, destinationChainId);
      if (!routeValidation.isValid) {
        await reply.code(400).send({
          error: "Invalid route",
          code: routeValidation.error?.code,
          message: routeValidation.error?.message,
          details: routeValidation.error?.details,
        });
        return;
      }

      const { universalAddress } = await computeUniversalAddress(
        ownerAddress as Address,
        recipientAddress as Address,
        BigInt(destinationChainId),
        sourceChainId,
      );

      await reply.send({ universalAddress });
    },
  );

  // GET /api/v1/me
  app.get(
    "/api/v1/me",
    { schema: addressesSchemas.getMe },
    async (req: AuthenticatedRequest, reply) => {
      if (!req.client) {
        await reply.code(401).send({ error: "Not authenticated" });
        return;
      }

      await reply.send({
        id: req.client.id,
        name: req.client.name,
        isActive: req.client.isActive,
        isMaster: req.client.isMaster,
      });
    },
  );
}
