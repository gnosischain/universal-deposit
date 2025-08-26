import type { Address } from "viem";
import {
  getPublicClient,
  getUsdcAddress as getUsdcFromRegistry,
  getProxyFactoryAddressFromRegistry,
  getStargateUsdcAddress as getStargateUsdcFromRegistry,
} from "../config/chains";

/**
 * Return a viem public client for a given chain id using the registry.
 */
export function publicClientFor(chainId: number) {
  return getPublicClient(chainId);
}

/**
 * Return configured USDC token address for a given chain id.
 * The registry stores token addresses per chain; source/destination use the same resolver.
 */
export function getSourceUsdcAddress(chainId: number): Address | undefined {
  return getUsdcFromRegistry(chainId) as Address | undefined;
}

/**
 * Return ProxyFactory address for a given source chain id from the registry.
 */
export function getProxyFactoryAddress(chainId: number): Address | undefined {
  return getProxyFactoryAddressFromRegistry(chainId) as Address | undefined;
}

/**
 * Return configured USDC token address for a destination chain id.
 * Currently same as source (single usdc per chain) but kept for semantic clarity.
 */
export function getDestinationUsdcAddress(
  chainId: number,
): Address | undefined {
  return getUsdcFromRegistry(chainId) as Address | undefined;
}

/**
 * Return configured Stargate USDC token address for a given chain id.
 * Used for fee quoting with Stargate protocol.
 */
export function getStargateUsdcAddress(chainId: number): Address | undefined {
  return getStargateUsdcFromRegistry(chainId) as Address | undefined;
}
