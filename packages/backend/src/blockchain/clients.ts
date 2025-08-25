import type { Address, Chain } from "viem";
import {
  getPublicClient,
  chainForId as chainForIdFromRegistry,
  walletClientFor as walletFromRegistry,
  getChainByKey,
  pickPreferredSourceKey,
  getProxyFactoryAddressFromRegistry,
} from "../config/chains";

/**
 * Registry-backed clients and helpers.
 * This file preserves the original import surface for the rest of the codebase.
 */

export function chainForId(id: number): Chain {
  return chainForIdFromRegistry(id);
}

export function walletClientFor(chainId: number, kind: "deployer" | "settler") {
  return walletFromRegistry(chainId, kind);
}

export type SourceNetworkKey = string;

/**
 * Select a source network by key (registry 'key'). If not provided, pick a preferred source.
 * Returns viem Chain, a public client, the proxyFactory address (if configured), and the sourceChainId.
 */
export function pickSourceNetwork(preferred?: SourceNetworkKey): {
  chain: Chain;
  publicClient: ReturnType<typeof getPublicClient>;
  proxyFactory: Address | undefined;
  sourceChainId: number;
} {
  const key = preferred ?? pickPreferredSourceKey();
  const entry = getChainByKey(key);
  const chain = chainForIdFromRegistry(entry.chainId);
  const publicClient = getPublicClient(key);
  const proxyFactory = getProxyFactoryAddressFromRegistry(entry.chainId) as
    | Address
    | undefined;

  return {
    chain,
    publicClient,
    proxyFactory,
    sourceChainId: entry.chainId,
  };
}
