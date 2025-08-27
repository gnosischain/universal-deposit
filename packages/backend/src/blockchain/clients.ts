import type { Address, Chain } from "viem";
import {
  getPublicClient,
  chainForId as chainForIdFromRegistry,
  walletClientFor as walletFromRegistry,
  getProxyFactoryAddressFromRegistry,
  getChainById,
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

export function pickSourceNetwork(sourceChainId: number): {
  chain: Chain;
  publicClient: ReturnType<typeof getPublicClient>;
  proxyFactory: Address | undefined;
  sourceChainId: number;
} {
  const entry = getChainById(sourceChainId);
  const chain = chainForIdFromRegistry(entry.chainId);
  const publicClient = getPublicClient(sourceChainId);
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
