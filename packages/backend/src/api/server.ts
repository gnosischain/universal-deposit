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
import { startHeartbeat } from "../monitoring/heartbeat";

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

  // Simple API key auth preHandler (can be replaced later with more robust auth)
  app.addHook("preHandler", async (req, reply) => {
    // Allow health and docs without API key
    const openPaths = [
      "/api/v1/health",
      "/api-docs",
      "/api-docs/json",
      "/metrics",
    ];
    if (openPaths.some((p) => req.url.startsWith(p))) return;

    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== config.API_SECRET_KEY) {
      await reply.code(401).send({ error: "Unauthorized" });
    }
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
      servers: [{ url: "http://localhost:" + config.API_PORT }],
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

  return app;
}

/**
 * Start server (used by orchestrator)
 */
export async function startAPIServer() {
  const app = await createServer();

  // Start API heartbeat (every 30s by default)
  startHeartbeat("api", 30000);

  await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
  logger.info({ port: config.API_PORT }, "API server listening");
}
