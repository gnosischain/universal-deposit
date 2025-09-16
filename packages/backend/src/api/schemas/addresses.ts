import { z } from "zod";

// Zod schemas for validation
export const RegisterAddressBody = z.object({
  ownerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid owner address"),
  recipientAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid recipient address"),
  destinationChainId: z.number().int().positive(),
  sourceChainId: z.number().int().positive(),
});

export const GetAddressQuery = z.object({
  ownerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid owner address"),
  recipientAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid recipient address"),
  destinationChainId: z.number().int().positive(),
  sourceChainId: z.number().int().positive(),
});

// OpenAPI/Swagger schemas
export const addressesSchemas = {
  // POST /api/v1/register-address
  registerAddress: {
    description:
      "Register a universal deposit address for cross-chain bridging",
    tags: ["Addresses"],
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: "object",
      properties: {
        ownerAddress: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description:
            "The owner address that can withdraw mistakenly sent tokens",
        },
        recipientAddress: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "The recipient address on the destination chain",
        },
        destinationChainId: {
          type: "integer",
          minimum: 1,
          description: "The destination chain ID (e.g., 100 for Gnosis Chain)",
        },
        sourceChainId: {
          type: "integer",
          minimum: 1,
          description: "The source chain ID (e.g., 41923 for EDU Chain)",
        },
      },
      required: [
        "ownerAddress",
        "recipientAddress",
        "destinationChainId",
        "sourceChainId",
      ],
      additionalProperties: false,
    },
    response: {
      200: {
        type: "object",
        properties: {
          universalAddress: {
            type: "string",
            pattern: "^0x[a-fA-F0-9]{40}$",
            description: "The computed universal deposit address",
          },
        },
        required: ["universalAddress"],
      },
      400: {
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object" },
        },
      },
      429: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
  },

  // GET /api/v1/address
  getAddress: {
    description:
      "Get universal deposit address without registering for monitoring",
    tags: ["Addresses"],
    security: [{ ApiKeyAuth: [] }],
    querystring: {
      type: "object",
      properties: {
        ownerAddress: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "The owner address",
        },
        recipientAddress: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "The recipient address on the destination chain",
        },
        destinationChainId: {
          type: "integer",
          minimum: 1,
          description: "The destination chain ID",
        },
        sourceChainId: {
          type: "integer",
          minimum: 1,
          description: "The source chain ID",
        },
      },
      required: [
        "ownerAddress",
        "recipientAddress",
        "destinationChainId",
        "sourceChainId",
      ],
      additionalProperties: false,
    },
    response: {
      200: {
        type: "object",
        properties: {
          universalAddress: {
            type: "string",
            pattern: "^0x[a-fA-F0-9]{40}$",
            description: "The computed universal deposit address",
          },
        },
        required: ["universalAddress"],
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

  // GET /api/v1/me
  getMe: {
    description: "Get current authenticated client information",
    tags: ["Addresses"],
    security: [{ ApiKeyAuth: [] }],
    response: {
      200: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isActive: { type: "boolean" },
          isMaster: { type: "boolean" },
        },
        required: ["id", "name", "isActive", "isMaster"],
      },
      401: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
  },
};
