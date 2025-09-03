import { getRegistry } from "../config/chains";
import type { ChainEntry, RouteEntry } from "../config/chains.schema";

export interface RouteValidationError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface RouteValidationResult {
  isValid: boolean;
  error?: RouteValidationError;
  sourceChain?: ChainEntry;
  destinationChain?: ChainEntry;
}

/**
 * Validates if a route between source and destination chains is supported
 * based on the chains.json configuration
 */
export function validateRoute(
  sourceChainId: number,
  destinationChainId: number,
): RouteValidationResult {
  const registry = getRegistry();

  // Find source chain
  const sourceChain = registry.chains.find(
    (chain: ChainEntry) => chain.chainId === sourceChainId,
  );
  if (!sourceChain) {
    return {
      isValid: false,
      error: {
        code: "INVALID_SOURCE_CHAIN",
        message: `Source chain ID ${sourceChainId} is not supported`,
        details: { sourceChainId },
      },
    };
  }

  // Find destination chain
  const destinationChain = registry.chains.find(
    (chain: ChainEntry) => chain.chainId === destinationChainId,
  );
  if (!destinationChain) {
    return {
      isValid: false,
      error: {
        code: "INVALID_DESTINATION_CHAIN",
        message: `Destination chain ID ${destinationChainId} is not supported`,
        details: { destinationChainId },
      },
    };
  }

  // Check if source chain has "source" role
  if (!sourceChain.roles.includes("source")) {
    return {
      isValid: false,
      error: {
        code: "CHAIN_NOT_SOURCE",
        message: `Chain ${sourceChain.name} (${sourceChainId}) is not configured as a source chain`,
        details: {
          chainName: sourceChain.name,
          chainId: sourceChainId,
          roles: sourceChain.roles,
        },
      },
    };
  }

  // Check if destination chain has "destination" role
  if (!destinationChain.roles.includes("destination")) {
    return {
      isValid: false,
      error: {
        code: "CHAIN_NOT_DESTINATION",
        message: `Chain ${destinationChain.name} (${destinationChainId}) is not configured as a destination chain`,
        details: {
          chainName: destinationChain.name,
          chainId: destinationChainId,
          roles: destinationChain.roles,
        },
      },
    };
  }

  // Check if route exists in routes configuration
  const routeExists = registry.routes?.some(
    (route: RouteEntry) =>
      route.source === sourceChain.key &&
      route.destination === destinationChain.key &&
      route.token === "USDC" &&
      route.enabled !== false,
  );

  if (!routeExists) {
    return {
      isValid: false,
      error: {
        code: "ROUTE_NOT_CONFIGURED",
        message: `Route from ${sourceChain.name} to ${destinationChain.name} is not configured or enabled`,
        details: {
          sourceChain: sourceChain.name,
          destinationChain: destinationChain.name,
          sourceKey: sourceChain.key,
          destinationKey: destinationChain.key,
          availableRoutes: registry.routes
            ?.filter((r: RouteEntry) => r.enabled !== false)
            .map((r: RouteEntry) => `${r.source} -> ${r.destination}`),
        },
      },
    };
  }

  // Check if source chain has required contracts
  if (!sourceChain.contracts.proxyFactory) {
    return {
      isValid: false,
      error: {
        code: "MISSING_PROXY_FACTORY",
        message: `Source chain ${sourceChain.name} does not have ProxyFactory contract configured`,
        details: {
          chainName: sourceChain.name,
          chainId: sourceChainId,
        },
      },
    };
  }

  if (!sourceChain.contracts.usdc) {
    return {
      isValid: false,
      error: {
        code: "MISSING_USDC_CONTRACT",
        message: `Source chain ${sourceChain.name} does not have USDC contract configured`,
        details: {
          chainName: sourceChain.name,
          chainId: sourceChainId,
        },
      },
    };
  }

  return {
    isValid: true,
    sourceChain,
    destinationChain,
  };
}

/**
 * Gets bridge amount limits for a specific chain
 */
export function getBridgeLimits(chainId: number): {
  minAmount: bigint;
  maxAmount: bigint;
} {
  const registry = getRegistry();
  const chain = registry.chains.find((c: ChainEntry) => c.chainId === chainId);

  if (!chain || !chain.policies) {
    // Fallback to default limits if chain or policies not found
    return {
      minAmount: BigInt("1000000"), // 1 USDC (6 decimals)
      maxAmount: BigInt("10000000000"), // 10k USDC
    };
  }

  return {
    minAmount: BigInt(chain.policies.minBridgeAmount || "1000000"),
    maxAmount: BigInt(chain.policies.maxBridgeAmount || "10000000000"),
  };
}

/**
 * Validates bridge amount against chain-specific limits
 */
export function validateBridgeAmount(
  amount: bigint,
  sourceChainId: number,
  destinationChainId: number,
): RouteValidationResult {
  const sourceLimits = getBridgeLimits(sourceChainId);
  const destLimits = getBridgeLimits(destinationChainId);

  // Use the most restrictive limits
  const minAmount =
    sourceLimits.minAmount > destLimits.minAmount
      ? sourceLimits.minAmount
      : destLimits.minAmount;
  const maxAmount =
    sourceLimits.maxAmount < destLimits.maxAmount
      ? sourceLimits.maxAmount
      : destLimits.maxAmount;

  if (amount < minAmount) {
    return {
      isValid: false,
      error: {
        code: "AMOUNT_TOO_LOW",
        message: `Bridge amount ${amount.toString()} is below minimum ${minAmount.toString()}`,
        details: {
          amount: amount.toString(),
          minAmount: minAmount.toString(),
          maxAmount: maxAmount.toString(),
        },
      },
    };
  }

  if (amount > maxAmount) {
    return {
      isValid: false,
      error: {
        code: "AMOUNT_TOO_HIGH",
        message: `Bridge amount ${amount.toString()} exceeds maximum ${maxAmount.toString()}`,
        details: {
          amount: amount.toString(),
          minAmount: minAmount.toString(),
          maxAmount: maxAmount.toString(),
        },
      },
    };
  }

  return { isValid: true };
}

/**
 * Gets all available routes for display/documentation
 */
export function getAvailableRoutes(): Array<{
  sourceChain: string;
  destinationChain: string;
  sourceChainId: number;
  destinationChainId: number;
  token: string;
}> {
  const registry = getRegistry();

  return (registry.routes || [])
    .filter((route: RouteEntry) => route.enabled !== false)
    .map((route: RouteEntry) => {
      const sourceChain = registry.chains.find(
        (c: ChainEntry) => c.key === route.source,
      );
      const destinationChain = registry.chains.find(
        (c: ChainEntry) => c.key === route.destination,
      );

      return {
        sourceChain: sourceChain?.name || route.source,
        destinationChain: destinationChain?.name || route.destination,
        sourceChainId: sourceChain?.chainId || 0,
        destinationChainId: destinationChain?.chainId || 0,
        token: route.token,
      };
    });
}
