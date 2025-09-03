import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../../database/client";
import { logger } from "../../utils/logger";
import {
  requireMasterKey,
  type AuthenticatedRequest,
} from "../../middleware/auth";
import { randomBytes } from "crypto";
import {
  adminSchemas,
  CreateClientBodySchema,
  UpdateClientBodySchema,
  ClientIdParamSchema,
} from "../schemas/admin";

/**
 * Generate a secure API key
 */
function generateApiKey(): string {
  return randomBytes(32).toString("hex");
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/admin/clients - Create new client
  app.post(
    "/api/v1/admin/clients",
    {
      schema: adminSchemas.createClient,
      preHandler: requireMasterKey,
    },
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      const parsed = CreateClientBodySchema.safeParse((req as any).body);
      if (!parsed.success) {
        await reply
          .code(400)
          .send({ error: "Invalid body", details: parsed.error.flatten() });
        return;
      }

      const { name } = parsed.data;
      const apiKey = generateApiKey();

      try {
        const client = await prisma.client.create({
          data: {
            name,
            apiKey,
          },
          select: {
            id: true,
            name: true,
            apiKey: true,
            isActive: true,
            createdAt: true,
          },
        });

        logger.info(
          { clientId: client.id, name: client.name },
          "Admin: Created new client",
        );

        await reply.code(201).send(client);
      } catch (error) {
        logger.error({ error, name }, "Admin: Failed to create client");
        await reply.code(500).send({
          error: "Failed to create client",
          message: "Database error occurred",
        });
      }
    },
  );

  // GET /api/v1/admin/clients - List all clients
  app.get(
    "/api/v1/admin/clients",
    {
      schema: adminSchemas.listClients,
      preHandler: requireMasterKey,
    },
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const clients = await prisma.client.findMany({
          select: {
            id: true,
            name: true,
            apiKey: true,
            isActive: true,
            createdAt: true,
            _count: {
              select: {
                orders: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        await reply.send({ clients });
      } catch (error) {
        logger.error({ error }, "Admin: Failed to list clients");
        await reply.code(500).send({
          error: "Failed to list clients",
          message: "Database error occurred",
        });
      }
    },
  );

  // GET /api/v1/admin/clients/:id - Get specific client
  app.get(
    "/api/v1/admin/clients/:id",
    {
      schema: adminSchemas.getClient,
      preHandler: requireMasterKey,
    },
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      const parsed = ClientIdParamSchema.safeParse((req as any).params);
      if (!parsed.success) {
        await reply.code(400).send({
          error: "Invalid client ID",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { id } = parsed.data;

      try {
        const client = await prisma.client.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            apiKey: true,
            isActive: true,
            createdAt: true,
            _count: {
              select: {
                orders: true,
              },
            },
          },
        });

        if (!client) {
          await reply.code(404).send({
            error: "Client not found",
            message: "No client found with the provided ID",
          });
          return;
        }

        await reply.send(client);
      } catch (error) {
        logger.error({ error, clientId: id }, "Admin: Failed to get client");
        await reply.code(500).send({
          error: "Failed to get client",
          message: "Database error occurred",
        });
      }
    },
  );

  // PUT /api/v1/admin/clients/:id - Update client
  app.put(
    "/api/v1/admin/clients/:id",
    {
      schema: adminSchemas.updateClient,
      preHandler: requireMasterKey,
    },
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      const paramsParsed = ClientIdParamSchema.safeParse((req as any).params);
      const bodyParsed = UpdateClientBodySchema.safeParse((req as any).body);

      if (!paramsParsed.success) {
        await reply.code(400).send({
          error: "Invalid client ID",
          details: paramsParsed.error.flatten(),
        });
        return;
      }

      if (!bodyParsed.success) {
        await reply.code(400).send({
          error: "Invalid body",
          details: bodyParsed.error.flatten(),
        });
        return;
      }

      const { id } = paramsParsed.data;
      const updateData = bodyParsed.data;

      if (Object.keys(updateData).length === 0) {
        await reply.code(400).send({
          error: "No update data provided",
          message: "At least one field must be provided for update",
        });
        return;
      }

      try {
        const client = await prisma.client.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            name: true,
            apiKey: true,
            isActive: true,
            createdAt: true,
          },
        });

        logger.info({ clientId: id, updateData }, "Admin: Updated client");

        await reply.send(client);
      } catch (error: any) {
        if (error?.code === "P2025") {
          await reply.code(404).send({
            error: "Client not found",
            message: "No client found with the provided ID",
          });
          return;
        }

        logger.error({ error, clientId: id }, "Admin: Failed to update client");
        await reply.code(500).send({
          error: "Failed to update client",
          message: "Database error occurred",
        });
      }
    },
  );

  // POST /api/v1/admin/clients/:id/regenerate-key - Regenerate API key
  app.post(
    "/api/v1/admin/clients/:id/regenerate-key",
    {
      schema: adminSchemas.regenerateApiKey,
      preHandler: requireMasterKey,
    },
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      const parsed = ClientIdParamSchema.safeParse((req as any).params);
      if (!parsed.success) {
        await reply.code(400).send({
          error: "Invalid client ID",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { id } = parsed.data;
      const newApiKey = generateApiKey();

      try {
        const client = await prisma.client.update({
          where: { id },
          data: { apiKey: newApiKey },
          select: {
            id: true,
            name: true,
            apiKey: true,
            isActive: true,
            createdAt: true,
          },
        });

        logger.info(
          { clientId: id, name: client.name },
          "Admin: Regenerated API key for client",
        );

        await reply.send(client);
      } catch (error: any) {
        if (error?.code === "P2025") {
          await reply.code(404).send({
            error: "Client not found",
            message: "No client found with the provided ID",
          });
          return;
        }

        logger.error(
          { error, clientId: id },
          "Admin: Failed to regenerate API key",
        );
        await reply.code(500).send({
          error: "Failed to regenerate API key",
          message: "Database error occurred",
        });
      }
    },
  );
}
