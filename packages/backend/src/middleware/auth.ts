import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../database/client";
import { config } from "../config/env";
import { logger } from "../utils/logger";

export interface AuthenticatedRequest extends FastifyRequest {
  client?: {
    id: string;
    name: string;
    isActive: boolean;
    isMaster: boolean;
  };
}

/**
 * Authentication middleware that validates API keys
 * Sets request.client with client information
 * Master key gets special privileges (isMaster: true)
 */
export async function authenticateApiKey(
  request: AuthenticatedRequest,
  reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers["x-api-key"] as string;

  if (!apiKey) {
    await reply.code(401).send({
      error: "Missing API key",
      message: "X-API-Key header is required",
    });
    return;
  }

  // Check if it's the master key
  if (apiKey === config.DEVELOPER_MASTER_KEY) {
    request.client = {
      id: "0000-0000-0000-0000",
      name: "Master Developer",
      isActive: true,
      isMaster: true,
    };
    return;
  }

  // Look up client by API key
  try {
    const client = await prisma.client.findUnique({
      where: { apiKey },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    if (!client) {
      await reply.code(401).send({
        error: "Invalid API key",
        message: "API key not found",
      });
      return;
    }

    if (!client.isActive) {
      await reply.code(401).send({
        error: "Inactive client",
        message: "Client account is disabled",
      });
      return;
    }

    request.client = {
      ...client,
      isMaster: false,
    };
  } catch (error) {
    logger.error(
      { error, apiKey: apiKey.substring(0, 8) + "..." },
      "Auth error",
    );
    await reply.code(500).send({
      error: "Authentication error",
      message: "Failed to validate API key",
    });
  }
}

/**
 * Middleware that requires master key access
 */
export async function requireMasterKey(
  request: AuthenticatedRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.client?.isMaster) {
    await reply.code(403).send({
      error: "Forbidden",
      message: "Master key required for this operation",
    });
  }
}
