import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { registerHealthRoute } from "../monitoring/health";
import { registerMetricsRoute } from "../monitoring/metrics";
import { registerAddressesRoutes } from "./routes/addresses";
import { registerOrdersRoutes } from "./routes/orders";
import { registerAdminRoutes } from "./routes/admin";
import { startHeartbeat } from "../monitoring/heartbeat";
import { authenticateApiKey } from "../middleware/auth";

/**
 * Create and configure Fastify instance
 */
export async function createServer() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  // Security & CORS
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true });

  // Global authentication with open endpoints whitelist
  app.addHook("preHandler", async (req, reply) => {
    const openPaths = [
      "/api/v1/health",
      "/api-docs",
      "/api-docs/json",
      "/metrics",
    ];
    if (openPaths.some((path) => req.url.startsWith(path))) {
      return; // Skip auth for open endpoints
    }

    // Apply basic API key authentication for all other routes
    await authenticateApiKey(req, reply);
  });

  // Rate limit (generic, we will also implement ownerAddress/day limiter inside route later)
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1", "::1"],
  });

  // Swagger/OpenAPI
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Universal Deposit API",
        version: "1.0.0",
        description:
          "Cross-chain USDC bridging service between EDU chain and Gnosis chain using Stargate/LayerZero. Node 22, Fastify, RabbitMQ.",
      },
      servers: [
        { url: config.API_PUBLIC_URL ?? "http://localhost:" + config.API_PORT },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
        },
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/api-docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  // Routes
  await registerHealthRoute(app);
  await registerMetricsRoute(app);
  await registerAddressesRoutes(app);
  await registerOrdersRoutes(app);
  await registerAdminRoutes(app);

  return app;
}

/**
 * Start server (used by orchestrator)
 */
export async function startAPIServer() {
  const app = await createServer();

  // Start API heartbeat
  startHeartbeat("api", config.HEARTBEAT_INTERVAL_MS);

  await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
  logger.info({ port: config.API_PORT }, "API server listening");
}
