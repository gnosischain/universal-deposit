import { z } from "zod";

// Zod schemas for validation
export const GetOrderByIdParams = z.object({
  id: z.string().min(1, "Order ID is required"),
});

export const GetOrderQuery = z.object({
  universalAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address")
    .optional(),
  sourceChainId: z.coerce.number().int().positive().optional(),
  nonce: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const GenerateIdBody = z.object({
  universalAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  recipientAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  destinationTokenAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  sourceChainId: z.coerce.number().int().positive(),
  destinationChainId: z.coerce.number().int().positive(),
  nonce: z.coerce.number().int().nonnegative(),
});

// OpenAPI/Swagger schemas
export const ordersSchemas = {
  // GET /api/v1/orders/:id
  getOrderById: {
    description: "Get a specific order by its ID",
    tags: ["Orders"],
    security: [{ ApiKeyAuth: [] }],
    params: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique order ID",
        },
      },
      required: ["id"],
    },
    response: {
      200: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          universalAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          ownerAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          recipientAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          sourceTokenAddress: {
            type: "string",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          destinationTokenAddress: {
            type: "string",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          destinationChainId: { type: "integer" },
          sourceChainId: { type: "integer" },
          nonce: { type: "integer" },
          amount: { type: "string", description: "Amount in wei as string" },
          status: {
            type: "string",
            enum: ["CREATED", "DEPLOYED", "COMPLETED", "FAILED"],
            description: "Current order status",
          },
          transactionHash: { type: "string", nullable: true },
          bridgeTransactionUrl: { type: "string", nullable: true },
          message: { type: "string", nullable: true },
          retries: { type: "integer", default: 0 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          clientId: { type: "string", nullable: true },
        },
        required: [
          "id",
          "universalAddress",
          "ownerAddress",
          "recipientAddress",
          "sourceTokenAddress",
          "destinationTokenAddress",
          "destinationChainId",
          "sourceChainId",
          "nonce",
          "amount",
          "status",
          "createdAt",
          "updatedAt",
        ],
      },
      400: {
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object" },
        },
      },
      404: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
  },

  // GET /api/v1/orders
  getOrders: {
    description: "Get orders by universal address or list all orders",
    tags: ["Orders"],
    security: [{ ApiKeyAuth: [] }],
    querystring: {
      type: "object",
      properties: {
        universalAddress: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Filter by universal address",
        },
        sourceChainId: {
          type: "integer",
          minimum: 1,
          description:
            "Source chain ID (required with nonce for single order lookup)",
        },
        nonce: {
          type: "integer",
          minimum: 0,
          description:
            "Transaction nonce (required with sourceChainId for single order lookup)",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Maximum number of orders to return",
        },
      },
      additionalProperties: false,
    },
    response: {
      200: {
        description: "Orders response - can be single order or array of orders",
      },
      400: {
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object" },
        },
      },
      404: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
  },

  // POST /api/v1/orders/generate-id
  generateOrderId: {
    description: "Generate a deterministic order ID for tracking purposes",
    tags: ["Orders"],
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: "object",
      properties: {
        universalAddress: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "The universal deposit address",
        },
        ownerAddress: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "The owner address",
        },
        recipientAddress: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "The recipient address on destination chain",
        },
        destinationTokenAddress: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "The token address on destination chain",
        },
        sourceChainId: {
          type: "integer",
          minimum: 1,
          description: "The source chain ID",
        },
        destinationChainId: {
          type: "integer",
          minimum: 1,
          description: "The destination chain ID",
        },
        nonce: {
          type: "integer",
          minimum: 0,
          description: "The transaction nonce",
        },
      },
      required: [
        "universalAddress",
        "ownerAddress",
        "recipientAddress",
        "destinationTokenAddress",
        "sourceChainId",
        "destinationChainId",
        "nonce",
      ],
      additionalProperties: false,
    },
    response: {
      200: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            format: "uuid",
            description: "The generated order ID",
          },
        },
        required: ["orderId"],
      },
      400: {
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object" },
        },
      },
    },
  },
};
