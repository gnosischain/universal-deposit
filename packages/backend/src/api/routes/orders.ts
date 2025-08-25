import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getOrderById,
  getOrderByParams,
  listOrdersByUniversal,
} from "../../database/repositories/orders.repo";
import { generateOrderId } from "../../utils/id";

const evmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address");

const GetOrderByIdParams = z.object({
  id: z.string().uuid("Invalid order id"),
});

const GetOrderQuery = z
  .object({
    universalAddress: evmAddress.optional(),
    sourceChainId: z.coerce.number().int().positive().optional(),
    nonce: z.coerce.number().int().nonnegative().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  })
  .refine(
    (q) =>
      (q.universalAddress && q.sourceChainId && typeof q.nonce === "number") ||
      (q.universalAddress && !q.sourceChainId && q.nonce === undefined),
    {
      message:
        "Provide either universalAddress+sourceChainId+nonce to fetch a single order, or universalAddress (+optional limit) to list recent orders.",
    },
  );

const GenerateIdBody = z.object({
  universalAddress: evmAddress,
  ownerAddress: evmAddress,
  recipientAddress: evmAddress,
  destinationTokenAddress: evmAddress,
  destinationChainId: z.coerce.number().int().positive(),
  nonce: z.coerce.number().int().nonnegative(),
});

export async function registerOrdersRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /api/v1/orders/:id
  app.get("/api/v1/orders/:id", async (req, reply) => {
    const parsed = GetOrderByIdParams.safeParse((req as any).params);
    if (!parsed.success) {
      await reply
        .code(400)
        .send({ error: "Invalid params", details: parsed.error.flatten() });
      return;
    }
    const order = await getOrderById(parsed.data.id);
    if (!order) {
      await reply.code(404).send({ error: "Order not found" });
      return;
    }
    await reply.send(order);
  });

  // GET /api/v1/orders
  app.get("/api/v1/orders", async (req, reply) => {
    const parsed = GetOrderQuery.safeParse((req as any).query);
    if (!parsed.success) {
      await reply
        .code(400)
        .send({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const q = parsed.data;

    // Single lookup path
    if (q.universalAddress && q.sourceChainId && typeof q.nonce === "number") {
      const order = await getOrderByParams({
        universalAddress: q.universalAddress,
        sourceChainId: q.sourceChainId,
        nonce: q.nonce,
      });
      if (!order) {
        await reply.code(404).send({ error: "Order not found" });
        return;
      }
      await reply.send(order);
      return;
    }

    // List path (recent orders for UDA)
    if (q.universalAddress) {
      const orders = await listOrdersByUniversal(
        q.universalAddress,
        q.limit ?? 20,
      );
      await reply.send(orders);
      return;
    }

    // Should be unreachable due to refine, but keep fallback
    await reply.code(400).send({ error: "Invalid query parameters" });
  });

  // POST /api/v1/orders/generate-id
  app.post("/api/v1/orders/generate-id", async (req, reply) => {
    const parsed = GenerateIdBody.safeParse((req as any).body);
    if (!parsed.success) {
      await reply
        .code(400)
        .send({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const id = generateOrderId(parsed.data);
    await reply.send({ orderId: id });
  });
}
