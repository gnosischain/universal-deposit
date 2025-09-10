import { config as env } from "../../../src/config/env";

export const TEST_CONFIG = {
  // Test timing configuration
  BALANCE_CHECK_INTERVAL_MS: 20000, // 20 seconds
  MAX_RETRIES: 20,
  TIMEOUT_MS: 400000, // 20 retries × 20 seconds = 400 seconds = 6.66 minutes

  // Balance tolerance (1% = 100 basis points)
  BALANCE_TOLERANCE_BPS: 100,

  // Test amounts
  INITIAL_TRANSFER_AMOUNT: 5_000000n, // 5 USDC (6 decimals)

  // API configuration
  API_BASE_URL: `http://localhost:${env.API_PORT}`,

  // Chain configurations for testing
  CHAINS: {
    GNOSIS: {
      chainId: 100,
      key: "gnosis",
      name: "Gnosis Chain",
    },
    ARBITRUM: {
      chainId: 42161,
      key: "arbitrum",
      name: "Arbitrum One",
    },
    EDU: {
      chainId: 41923,
      key: "edu",
      name: "EDU Chain",
    },
  },

  // Test workflows
  WORKFLOWS: [
    {
      name: "Gnosis → EDU",
      sourceChain: "gnosis",
      destinationChain: "edu",
      amount: "FIXED" as const,
    },
    {
      name: "EDU → Gnosis",
      sourceChain: "edu",
      destinationChain: "gnosis",
      amount: "FULL_BALANCE" as const,
    },

    {
      name: "Gnosis → Arbitrum",
      sourceChain: "gnosis",
      destinationChain: "arbitrum",
      amount: "FIXED" as const,
    },
    {
      name: "Arbitrum → Gnosis",
      sourceChain: "arbitrum",
      destinationChain: "gnosis",
      amount: "FULL_BALANCE" as const,
    },
  ],
} as const;

export type TestWorkflow = (typeof TEST_CONFIG.WORKFLOWS)[number];
export type ChainKey = keyof typeof TEST_CONFIG.CHAINS;
