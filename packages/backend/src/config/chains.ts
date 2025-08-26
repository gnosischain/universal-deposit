import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import type { Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config as env } from "./env";
import { ChainsRegistrySchema } from "./chains.schema";
import type { ChainsRegistry, ChainEntry } from "./chains.schema";

/**
 * Chains registry loader (no env fallback).
 * - External file (CHAINS_CONFIG_PATH) or inline JSON (CHAINS_CONFIG_JSON) is REQUIRED.
 * - Helper utilities to build viem clients and resolve addresses.
 */

const DEFAULT_LZ_SCAN_BASE = "https://layerzeroscan.com/tx";

let cachedRegistry: ChainsRegistry | null = null;
let byId: Map<number, ChainEntry>;
let byKey: Map<string, ChainEntry>;

/**
 * Try to load JSON from either CHAINS_CONFIG_JSON or CHAINS_CONFIG_PATH.
 */
function loadFromConfigFiles(): ChainsRegistry | null {
  const inline = process.env.CHAINS_CONFIG_JSON;
  if (inline && inline.trim().length > 0) {
    const parsed = JSON.parse(inline);
    const val = ChainsRegistrySchema.parse(parsed);
    return val;
  }

  const defaultPath = path.resolve(process.cwd(), "config", "chains.json");
  const filePath = process.env.CHAINS_CONFIG_PATH ?? defaultPath;
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content);
    const val = ChainsRegistrySchema.parse(parsed);
    return val;
  }
  return null;
}

function index(reg: ChainsRegistry): void {
  byId = new Map<number, ChainEntry>();
  byKey = new Map<string, ChainEntry>();
  for (const c of reg.chains) {
    byId.set(c.chainId, c);
    byKey.set(c.key, c);
  }
}

export function getRegistry(): ChainsRegistry {
  if (cachedRegistry) return cachedRegistry;
  const fromFiles = loadFromConfigFiles();
  if (!fromFiles) {
    throw new Error(
      "Chains registry is required. Provide CHAINS_CONFIG_JSON or CHAINS_CONFIG_PATH (config/chains.json).",
    );
  }
  cachedRegistry = fromFiles;
  index(cachedRegistry);
  return cachedRegistry;
}

export function getChainById(id: number): ChainEntry {
  if (!cachedRegistry) {
    getRegistry();
  }
  const entry = byId.get(id);
  if (!entry) {
    throw new Error(`Chain id ${id} is not present in chains registry`);
  }
  return entry;
}

export function getChainByKey(key: string): ChainEntry {
  if (!cachedRegistry) {
    getRegistry();
  }
  const entry = byKey.get(key);
  if (!entry) {
    throw new Error(`Chain key "${key}" is not present in chains registry`);
  }
  return entry;
}

function resolveRpcUrl(spec: unknown): string {
  if (typeof spec === "string") return spec;
  if (spec && typeof spec === "object" && "url" in (spec as any)) {
    const url = (spec as any).url as string;
    const keyEnv = (spec as any).keyEnv as string | undefined;
    const key = (keyEnv ? process.env[keyEnv] : process.env.RPC_API_KEY) ?? "";
    if (url.includes("{RPC_API_KEY}")) {
      return url.replaceAll("{RPC_API_KEY}", key);
    }
    return url;
  }
  return String(spec);
}

export function chooseRpcHttp(source: string | number): string {
  const entry =
    typeof source === "string" ? getChainByKey(source) : getChainById(source);
  return resolveRpcUrl((entry.rpc.http as unknown[])[0]);
}

/**
 * Build a minimal viem Chain from a registry entry.
 */
export function toViemChain(entry: ChainEntry): Chain {
  const native = entry.nativeCurrency ?? {
    name: "Native",
    symbol: "NATIVE",
    decimals: 18,
  };
  return {
    id: entry.chainId,
    name: entry.name ?? `chain-${entry.chainId}`,
    nativeCurrency: native,
    rpcUrls: {
      default: {
        http: (entry.rpc.http as unknown[]).map((u) => resolveRpcUrl(u)),
      },
    },
  } as unknown as Chain;
}

/**
 * Resolve viem Chain by id.
 */
export function chainForId(id: number): Chain {
  const entry = getChainById(id);
  return toViemChain(entry);
}

/**
 * Public client builders
 */
export function getPublicClient(source: string | number) {
  const entry =
    typeof source === "string" ? getChainByKey(source) : getChainById(source);
  return createPublicClient({
    chain: toViemChain(entry),
    transport: http(chooseRpcHttp(entry.key)),
  });
}

export function getPublicClientById(id: number) {
  return getPublicClient(id);
}

/**
 * Wallet client builder with per-chain or global key selection.
 * - If signerKeys.deployerKeyEnv / settlerKeyEnv is configured, use that env var.
 * - Else fall back to global DEPLOYMENT_PRIVATE_KEY / SETTLEMENT_PRIVATE_KEY.
 */
export function walletClientFor(
  chainId: number,
  kind: "deployer" | "settler",
): ReturnType<typeof createWalletClient> | undefined {
  const entry = getChainById(chainId);

  let keyHex: string | undefined;
  if (kind === "deployer") {
    const envName = entry.signerKeys?.deployerKeyEnv;
    keyHex = envName ? process.env[envName] : env.DEPLOYMENT_PRIVATE_KEY;
  } else {
    const envName = entry.signerKeys?.settlerKeyEnv;
    keyHex = envName ? process.env[envName] : env.SETTLEMENT_PRIVATE_KEY;
  }
  if (!keyHex) return undefined;

  const chain = toViemChain(entry);
  const rpc = chooseRpcHttp(entry.key);
  return createWalletClient({
    chain,
    transport: http(rpc),
    // viem expects Account object; privateKeyToAccount takes 0x-prefixed 32-byte hex
    account: privateKeyToAccount(keyHex as `0x${string}`),
  });
}

/**
 * Contracts and protocol helpers
 */
export function getUsdcAddress(chainId: number): `0x${string}` | undefined {
  return getChainById(chainId).contracts.usdc as `0x${string}` | undefined;
}

export function getStargateUsdcAddress(
  chainId: number,
): `0x${string}` | undefined {
  return getChainById(chainId).contracts.stargateUsdc as
    | `0x${string}`
    | undefined;
}

export function getProxyFactoryAddressFromRegistry(
  chainId: number,
): `0x${string}` | undefined {
  return getChainById(chainId).contracts.proxyFactory as
    | `0x${string}`
    | undefined;
}

export function getLayerZeroScanUrl(
  txHash: `0x${string}`,
  source: string | number,
): string {
  const entry =
    typeof source === "string" ? getChainByKey(source) : getChainById(source);
  const base = entry.layerZero?.scanBaseUrl ?? DEFAULT_LZ_SCAN_BASE;
  return `${base.replace(/\/+$/, "")}/${txHash}`;
}

/**
 * Route helpers
 */
export function listRoutes(): {
  source: string;
  destination: string;
  token: "USDC";
}[] {
  const reg = getRegistry();
  const routes = (reg.routes ?? []).filter((r) => r.enabled !== false);
  return routes.map((r) => ({
    source: r.source,
    destination: r.destination,
    token: r.token,
  }));
}

/**
 * Utility: select a preferred source network key for UD creation when not specified.
 * Preference order:
 *  - First "source" chain with a configured proxyFactory
 *  - Fallback to the first "source" chain
 */
export function pickPreferredSourceKey(): string {
  const reg = getRegistry();
  const sources = reg.chains.filter((c) => c.roles.includes("source"));
  const withFactory = sources.find((c) => !!c.contracts.proxyFactory);
  return (withFactory ?? sources[0])?.key ?? sources[0]?.key ?? "source";
}
