import { z } from "zod";

// Zod validation schemas
export const CreateClientBodySchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

export const UpdateClientBodySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name too long")
    .optional(),
  isActive: z.boolean().optional(),
});

export const ClientIdParamSchema = z.object({
  id: z.string().uuid("Invalid client ID format"),
});

// OpenAPI/Swagger schemas
export const adminSchemas = {
  createClient: {
    description: "Create a new API client",
    tags: ["Admin"],
    security: [{ MasterKeyAuth: [] }],
    body: {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string",
          minLength: 1,
          maxLength: 100,
          description: "Client name",
        },
      },
      additionalProperties: false,
    },
    response: {
      201: {
        description: "Client created successfully",
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            description: "Client ID",
          },
          name: {
            type: "string",
            description: "Client name",
          },
          apiKey: {
            type: "string",
            description: "Generated API key",
          },
          isActive: {
            type: "boolean",
            description: "Whether the client is active",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Creation timestamp",
          },
        },
        required: ["id", "name", "apiKey", "isActive", "createdAt"],
      },
      400: {
        description: "Invalid request body",
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object" },
        },
      },
      401: {
        description: "Unauthorized - Master key required",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
      500: {
        description: "Internal server error",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },

  listClients: {
    description: "List all API clients",
    tags: ["Admin"],
    security: [{ MasterKeyAuth: [] }],
    response: {
      200: {
        description: "List of clients",
        type: "object",
        properties: {
          clients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  format: "uuid",
                  description: "Client ID",
                },
                name: {
                  type: "string",
                  description: "Client name",
                },
                apiKey: {
                  type: "string",
                  description: "API key",
                },
                isActive: {
                  type: "boolean",
                  description: "Whether the client is active",
                },
                createdAt: {
                  type: "string",
                  format: "date-time",
                  description: "Creation timestamp",
                },
                _count: {
                  type: "object",
                  properties: {
                    orders: {
                      type: "integer",
                      description: "Number of orders created by this client",
                    },
                  },
                },
              },
            },
          },
        },
        required: ["clients"],
      },
      401: {
        description: "Unauthorized - Master key required",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
      500: {
        description: "Internal server error",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },

  getClient: {
    description: "Get a specific API client by ID",
    tags: ["Admin"],
    security: [{ MasterKeyAuth: [] }],
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          format: "uuid",
          description: "Client ID",
        },
      },
      additionalProperties: false,
    },
    response: {
      200: {
        description: "Client details",
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            description: "Client ID",
          },
          name: {
            type: "string",
            description: "Client name",
          },
          apiKey: {
            type: "string",
            description: "API key",
          },
          isActive: {
            type: "boolean",
            description: "Whether the client is active",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Creation timestamp",
          },
          _count: {
            type: "object",
            properties: {
              orders: {
                type: "integer",
                description: "Number of orders created by this client",
              },
            },
          },
        },
        required: ["id", "name", "apiKey", "isActive", "createdAt", "_count"],
      },
      400: {
        description: "Invalid client ID format",
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object" },
        },
      },
      401: {
        description: "Unauthorized - Master key required",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
      404: {
        description: "Client not found",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
      500: {
        description: "Internal server error",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },

  updateClient: {
    description: "Update an API client",
    tags: ["Admin"],
    security: [{ MasterKeyAuth: [] }],
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          format: "uuid",
          description: "Client ID",
        },
      },
      additionalProperties: false,
    },
    body: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          maxLength: 100,
          description: "Client name",
        },
        isActive: {
          type: "boolean",
          description: "Whether the client should be active",
        },
      },
      additionalProperties: false,
    },
    response: {
      200: {
        description: "Client updated successfully",
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            description: "Client ID",
          },
          name: {
            type: "string",
            description: "Client name",
          },
          apiKey: {
            type: "string",
            description: "API key",
          },
          isActive: {
            type: "boolean",
            description: "Whether the client is active",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Creation timestamp",
          },
        },
        required: ["id", "name", "apiKey", "isActive", "createdAt"],
      },
      400: {
        description: "Invalid request",
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object" },
          message: { type: "string" },
        },
      },
      401: {
        description: "Unauthorized - Master key required",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
      404: {
        description: "Client not found",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
      500: {
        description: "Internal server error",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },

  regenerateApiKey: {
    description: "Regenerate API key for a client",
    tags: ["Admin"],
    security: [{ MasterKeyAuth: [] }],
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "string",
          format: "uuid",
          description: "Client ID",
        },
      },
      additionalProperties: false,
    },
    response: {
      200: {
        description: "API key regenerated successfully",
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            description: "Client ID",
          },
          name: {
            type: "string",
            description: "Client name",
          },
          apiKey: {
            type: "string",
            description: "New API key",
          },
          isActive: {
            type: "boolean",
            description: "Whether the client is active",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Creation timestamp",
          },
        },
        required: ["id", "name", "apiKey", "isActive", "createdAt"],
      },
      400: {
        description: "Invalid client ID format",
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object" },
        },
      },
      401: {
        description: "Unauthorized - Master key required",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
      404: {
        description: "Client not found",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
      500: {
        description: "Internal server error",
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
};
