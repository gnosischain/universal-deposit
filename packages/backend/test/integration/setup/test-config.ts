import { config as env } from "../../../src/config/env";

export const TEST_CONFIG = {
  // Test timing configuration
  BALANCE_CHECK_INTERVAL_MS: 20000, // 20 seconds
  MAX_RETRIES: 200,
  TIMEOUT_MS: 4000000, // 200 retries × 20 seconds = 4000 seconds = 66.66 minutes

  // RPC retry configuration
  RPC_RETRY: {
    MAX_ATTEMPTS: 5,
    BASE_DELAY_MS: 1000, // Start with 1 second
    BACKOFF_MULTIPLIER: 1.5, // 1.5x delay each retry (1s, 1.5s, 2.25s, 3.4s, 5.1s)
    MAX_DELAY_MS: 10000, // Cap at 10 seconds
  },

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
    ETHEREUM: {
      chainId: 1,
      key: "ethereum",
      name: "Ethereum Mainnet",
    },
    BASE: {
      chainId: 8453,
      key: "base",
      name: "Base",
    },
    OPTIMISM: {
      chainId: 10,
      key: "optimism",
      name: "Optimism",
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

    // {
    //   name: "Gnosis → Ethereum",
    //   sourceChain: "gnosis",
    //   destinationChain: "ethereum",
    //   amount: "FIXED" as const,
    // },
    // {
    //   name: "Ethereum → Gnosis",
    //   sourceChain: "ethereum",
    //   destinationChain: "gnosis",
    //   amount: "FULL_BALANCE" as const,
    // },

    {
      name: "Gnosis → Base",
      sourceChain: "gnosis",
      destinationChain: "base",
      amount: "FIXED" as const,
    },
    {
      name: "Base → Gnosis",
      sourceChain: "base",
      destinationChain: "gnosis",
      amount: "FULL_BALANCE" as const,
    },

    {
      name: "Gnosis → Optimism",
      sourceChain: "gnosis",
      destinationChain: "optimism",
      amount: "FIXED" as const,
    },
    {
      name: "Optimism → Gnosis",
      sourceChain: "optimism",
      destinationChain: "gnosis",
      amount: "FULL_BALANCE" as const,
    },
  ],
} as const;

export type TestWorkflow = (typeof TEST_CONFIG.WORKFLOWS)[number];
export type ChainKey = keyof typeof TEST_CONFIG.CHAINS;
