import type { FastifyInstance, FastifyReply } from "fastify";
import {
  getOrderByIdWithClientFilter,
  getOrderByParamsWithClientFilter,
  listOrdersByUniversalWithClientFilter,
  listAllOrdersWithClientFilter,
} from "../../database/repositories/orders.repo";
import { generateOrderId } from "../../utils/id";
import { type AuthenticatedRequest } from "../../middleware/auth";
import {
  GetOrderByIdParams,
  GetOrderQuery,
  GenerateIdBody,
  ordersSchemas,
} from "../schemas/orders";

export async function registerOrdersRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /api/v1/orders/:id
  app.get(
    "/api/v1/orders/:id",
    { schema: ordersSchemas.getOrderById },
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      const parsed = GetOrderByIdParams.safeParse((req as any).params);
      if (!parsed.success) {
        await reply
          .code(400)
          .send({ error: "Invalid params", details: parsed.error.flatten() });
        return;
      }

      // Master key can see all orders, regular clients only see their own
      const clientId = req.client!.isMaster ? undefined : req.client!.id;
      const order = await getOrderByIdWithClientFilter(
        parsed.data.id,
        clientId,
      );

      if (!order) {
        await reply.code(404).send({ error: "Order not found" });
        return;
      }
      await reply.send(order);
    },
  );

  // GET /api/v1/orders
  app.get(
    "/api/v1/orders",
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      const parsed = GetOrderQuery.safeParse((req as any).query);
      if (!parsed.success) {
        await reply
          .code(400)
          .send({ error: "Invalid query", details: parsed.error.flatten() });
        return;
      }
      const q = parsed.data;

      // Master key can see all orders, regular clients only see their own
      const clientId = req.client!.isMaster ? undefined : req.client!.id;

      // Single lookup by universalAddress + sourceChainId + nonce
      if (
        q.universalAddress &&
        q.sourceChainId &&
        typeof q.nonce === "number"
      ) {
        const order = await getOrderByParamsWithClientFilter(
          {
            universalAddress: q.universalAddress,
            sourceChainId: q.sourceChainId,
            nonce: q.nonce,
          },
          clientId,
        );
        if (!order) {
          await reply.code(404).send({ error: "Order not found" });
          return;
        }
        await reply.send(order);
        return;
      }

      // List path (recent orders for UDA)
      if (q.universalAddress) {
        const orders = await listOrdersByUniversalWithClientFilter(
          q.universalAddress,
          q.limit ?? 20,
          clientId,
        );
        await reply.send(orders);
        return;
      }

      // List all orders (master key only gets all, regular clients get filtered)
      const orders = await listAllOrdersWithClientFilter(
        q.limit ?? 20,
        clientId,
      );
      await reply.send(orders);
    },
  );

  // POST /api/v1/orders/generate-id
  app.post(
    "/api/v1/orders/generate-id",
    { schema: ordersSchemas.generateOrderId },
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      const parsed = GenerateIdBody.safeParse((req as any).body);
      if (!parsed.success) {
        await reply
          .code(400)
          .send({ error: "Invalid body", details: parsed.error.flatten() });
        return;
      }
      const id = generateOrderId(parsed.data);
      await reply.send({ orderId: id });
    },
  );
}
