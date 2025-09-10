import { config as env } from "../../../src/config/env";

/**
 * Test environment configuration and validation
 */
export class TestEnvironment {
  static validate(): void {
    const required = [
      "DEPLOYMENT_PRIVATE_KEY",
      "RPC_API_KEY",
      "DEVELOPER_MASTER_KEY",
    ];

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables for integration tests: ${missing.join(
          ", ",
        )}`,
      );
    }

    // Validate private key format
    const privateKey = process.env.DEPLOYMENT_PRIVATE_KEY;
    if (!privateKey?.startsWith("0x") || privateKey.length !== 66) {
      throw new Error(
        "DEPLOYMENT_PRIVATE_KEY must be a valid 0x-prefixed 32-byte hex string",
      );
    }

    // Validate master key
    const masterKey = process.env.DEVELOPER_MASTER_KEY;
    if (!masterKey || masterKey.length < 10) {
      throw new Error(
        "DEVELOPER_MASTER_KEY must be at least 10 characters long",
      );
    }
  }

  static getTestWalletPrivateKey(): `0x${string}` {
    const key = env.DEPLOYMENT_PRIVATE_KEY;
    if (!key) {
      throw new Error("DEPLOYMENT_PRIVATE_KEY not configured");
    }
    return key as `0x${string}`;
  }

  static getMasterKey(): string {
    const key = process.env.DEVELOPER_MASTER_KEY;
    if (!key) {
      throw new Error("DEVELOPER_MASTER_KEY not configured");
    }
    return key;
  }

  static getRpcApiKey(): string {
    const key = process.env.RPC_API_KEY;
    if (!key) {
      throw new Error("RPC_API_KEY not configured");
    }
    return key;
  }

  static isMainnetTxEnabled(): boolean {
    return process.env.ENABLE_MAINNET_TX === "true";
  }

  static ensureMainnetTxEnabled(): void {
    if (!this.isMainnetTxEnabled()) {
      throw new Error(
        "Integration tests require ENABLE_MAINNET_TX=true to perform actual blockchain transactions",
      );
    }
  }
}

/**
 * Wait for a service to be ready by polling its health endpoint
 */
export async function waitForServiceReady(
  url: string,
  timeoutMs: number = 30000,
  intervalMs: number = 1000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Service not ready yet, continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Service at ${url} did not become ready within ${timeoutMs}ms`,
  );
}

/**
 * Sleep utility for test delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format USDC amount for display (6 decimals)
 */
export function formatUsdc(amount: bigint): string {
  const decimals = 6;
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fractional = amount % divisor;

  return `${whole}.${fractional.toString().padStart(decimals, "0")} USDC`;
}

/**
 * Calculate percentage difference between two amounts
 */
export function calculatePercentageDifference(
  expected: bigint,
  actual: bigint,
): number {
  if (expected === 0n) return actual === 0n ? 0 : 100;

  const diff = actual > expected ? actual - expected : expected - actual;
  return Number((diff * 10000n) / expected) / 100; // Convert to percentage with 2 decimal places
}

/**
 * Check if actual amount is within tolerance of expected amount
 */
export function isWithinTolerance(
  expected: bigint,
  actual: bigint,
  toleranceBps: number,
): boolean {
  const percentageDiff = calculatePercentageDifference(expected, actual);
  return percentageDiff <= toleranceBps / 100;
}
