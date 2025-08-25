import { z } from "zod";

// Basic validators
export const HexAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address");

export const UrlArray = z
  .array(z.string().url({ message: "Invalid RPC URL" }))
  .nonempty("At least one RPC URL is required");

// Contracts / Protocol metadata
export const StargateSchema = z
  .object({
    tokenType: z.enum(["POOL", "OFT"]).optional(), // informative; OFT e.g. Hydra OFT
    router: HexAddress.optional(),
    token: HexAddress.optional(), // e.g. OFT token address
    poolId: z.number().int().positive().optional(), // for POOL routes if needed
  })
  .strict();

export const UrlEntrySchema = z.union([
  z.string().url({ message: "Invalid RPC URL" }),
  z
    .object({
      url: z.string().url({ message: "Invalid RPC URL" }),
      keyEnv: z.string().min(1).optional(), // name of env var to use (e.g., ALCHEMY_KEY)
    })
    .strict(),
]);

export const ContractsSchema = z
  .object({
    proxyFactory: HexAddress.optional(),
    udManager: HexAddress.optional(),
    udAccount: HexAddress.optional(),
    usdc: HexAddress.optional(),
    stargateUsdc: HexAddress.optional(),
  })
  .strict();

export const LayerZeroSchema = z
  .object({
    endpointId: z.number().int().positive().optional(), // LayerZero EID for chain
    scanBaseUrl: z.string().url().optional(), // defaults to https://layerzeroscan.com/tx
  })
  .strict();

export const PoliciesSchema = z
  .object({
    // Accept string or number; string recommended to preserve big integer precision
    minBridgeAmount: z.union([z.string(), z.number()]).optional(),
    maxBridgeAmount: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export const SignerKeysSchema = z
  .object({
    // Names of environment variables that hold private keys (never store raw keys in JSON)
    deployerKeyEnv: z.string().min(1).optional(),
    settlerKeyEnv: z.string().min(1).optional(),
  })
  .strict();

// One chain configuration entry
export const ChainEntrySchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z0-9\-]+$/i, "Key must be alphanumeric/hyphen")
      .describe("Human-readable key, e.g., edu, gnosis, arbitrum"),
    chainId: z.number().int().nonnegative(),
    rpc: z
      .object({
        http: z.array(UrlEntrySchema).nonempty(),
      })
      .strict(),
    roles: z.array(z.enum(["source", "destination"])).nonempty(),
    contracts: ContractsSchema.default({}),
    layerZero: LayerZeroSchema.optional(),
    policies: PoliciesSchema.optional(),
    signerKeys: SignerKeysSchema.optional(),
    // Optional display name/symbol for completeness
    name: z.string().optional(),
    nativeCurrency: z
      .object({
        name: z.string(),
        symbol: z.string(),
        decimals: z.number().int().positive(),
      })
      .partial()
      .optional(),
  })
  .strict();

// Allowed bridging routes (optional allowlist)
export const RouteSchema = z
  .object({
    source: z.string(), // must match ChainEntry.key
    destination: z.string(), // must match ChainEntry.key
    token: z.enum(["USDC"]).default("USDC"),
    enabled: z.boolean().default(true),
  })
  .strict();

// Registry root
export const ChainsRegistrySchema = z
  .object({
    version: z.number().int().positive().default(1),
    chains: z.array(ChainEntrySchema).nonempty(),
    routes: z.array(RouteSchema).optional(),
  })
  .strict();

export type ChainsRegistry = z.infer<typeof ChainsRegistrySchema>;
export type ChainEntry = z.infer<typeof ChainEntrySchema>;
export type RouteEntry = z.infer<typeof RouteSchema>;
