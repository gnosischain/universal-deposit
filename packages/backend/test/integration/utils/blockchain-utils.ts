import { type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getPublicClient,
  walletClientFor,
  getUsdcAddress,
} from "../../../src/config/chains";
import { TestEnvironment, sleep, formatUsdc } from "../setup/test-env";
import { TEST_CONFIG } from "../setup/test-config";
import ERC20Abi from "../../../src/blockchain/contracts/ERC20.abi.json";

/**
 * Blockchain utilities for integration tests
 */
export class BlockchainUtils {
  /**
   * Get USDC balance for an address on a specific chain
   */
  static async getUsdcBalance(
    chainId: number,
    address: Address,
  ): Promise<bigint> {
    const publicClient = getPublicClient(chainId);
    const usdcAddress = getUsdcAddress(chainId);

    if (!usdcAddress) {
      throw new Error(`USDC address not configured for chain ${chainId}`);
    }

    const balance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [address],
    });

    return balance as bigint;
  }

  /**
   * Get the test wallet address from private key
   */
  static getTestWalletAddress(): Address {
    const privateKey = TestEnvironment.getTestWalletPrivateKey();
    const account = privateKeyToAccount(privateKey);
    return account.address;
  }

  /**
   * Send USDC from test wallet to a target address
   */
  static async sendUsdc(
    sourceChainId: number,
    to: Address,
    amount: bigint,
  ): Promise<string> {
    const walletClient = walletClientFor(sourceChainId, "deployer");
    const usdcAddress = getUsdcAddress(sourceChainId);

    if (!walletClient || !walletClient.account) {
      throw new Error(
        `Wallet client not configured for chain ${sourceChainId}`,
      );
    }

    if (!usdcAddress) {
      throw new Error(`USDC address not configured for chain ${sourceChainId}`);
    }

    console.log(
      `Sending ${formatUsdc(amount)} to ${to} on chain ${sourceChainId}`,
    );

    const hash = await walletClient.writeContract({
      address: usdcAddress,
      abi: ERC20Abi,
      functionName: "transfer",
      args: [to, amount],
      chain: walletClient.chain,
      account: walletClient.account,
    });

    console.log(`Transaction sent: ${hash}`);

    // Wait for transaction confirmation
    const publicClient = getPublicClient(sourceChainId);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== "success") {
      throw new Error(`Transaction failed: ${hash}`);
    }

    console.log(`Transaction confirmed: ${hash}`);
    return hash;
  }

  /**
   * Get full USDC balance of test wallet on a chain
   */
  static async getTestWalletUsdcBalance(chainId: number): Promise<bigint> {
    const walletAddress = this.getTestWalletAddress();
    return this.getUsdcBalance(chainId, walletAddress);
  }

  /**
   * Send full USDC balance from test wallet to target address
   */
  static async sendFullUsdcBalance(
    sourceChainId: number,
    to: Address,
  ): Promise<{ hash: string; amount: bigint }> {
    const balance = await this.getTestWalletUsdcBalance(sourceChainId);

    if (balance === 0n) {
      throw new Error(`No USDC balance on chain ${sourceChainId}`);
    }

    const hash = await this.sendUsdc(sourceChainId, to, balance);
    return { hash, amount: balance };
  }

  /**
   * Wait for balance change on a specific address with retry logic
   */
  static async waitForBalanceChange(
    chainId: number,
    address: Address,
    initialBalance: bigint,
    expectedIncrease?: bigint,
  ): Promise<{ finalBalance: bigint; actualIncrease: bigint }> {
    console.log(
      `Monitoring balance on chain ${chainId} for address ${address}`,
    );
    console.log(`Initial balance: ${formatUsdc(initialBalance)}`);

    if (expectedIncrease) {
      console.log(`Expected increase: ${formatUsdc(expectedIncrease)}`);
    }

    for (let attempt = 1; attempt <= TEST_CONFIG.MAX_RETRIES; attempt++) {
      console.log(
        `Balance check attempt ${attempt}/${TEST_CONFIG.MAX_RETRIES}`,
      );

      const currentBalance = await this.getUsdcBalance(chainId, address);
      const actualIncrease = currentBalance - initialBalance;

      console.log(`Current balance: ${formatUsdc(currentBalance)}`);
      console.log(`Actual increase: ${formatUsdc(actualIncrease)}`);

      if (actualIncrease > 0n) {
        console.log("✅ Balance increase detected!");
        return { finalBalance: currentBalance, actualIncrease };
      }

      if (attempt < TEST_CONFIG.MAX_RETRIES) {
        console.log(
          `No balance change yet, waiting ${TEST_CONFIG.BALANCE_CHECK_INTERVAL_MS}ms...`,
        );
        await sleep(TEST_CONFIG.BALANCE_CHECK_INTERVAL_MS);
      }
    }

    throw new Error(
      `Balance did not change after ${TEST_CONFIG.MAX_RETRIES} attempts (${TEST_CONFIG.TIMEOUT_MS}ms total)`,
    );
  }

  /**
   * Verify test wallet has sufficient USDC balance for testing
   */
  static async verifyTestWalletFunding(
    chainId: number,
    minAmount: bigint,
  ): Promise<void> {
    const balance = await this.getTestWalletUsdcBalance(chainId);
    const walletAddress = this.getTestWalletAddress();

    console.log(
      `Test wallet ${walletAddress} balance on chain ${chainId}: ${formatUsdc(balance)}`,
    );

    if (balance < minAmount) {
      throw new Error(
        `Insufficient USDC balance. Required: ${formatUsdc(minAmount)}, Available: ${formatUsdc(balance)}`,
      );
    }

    console.log("✅ Test wallet has sufficient USDC balance");
  }

  /**
   * Get chain name for logging
   */
  static getChainName(chainId: number): string {
    const chainConfig = Object.values(TEST_CONFIG.CHAINS).find(
      (c) => c.chainId === chainId,
    );
    return chainConfig?.name ?? `Chain ${chainId}`;
  }

  /**
   * Log balance summary for multiple chains
   */
  static async logBalanceSummary(
    address: Address,
    chainIds: number[],
    label: string = "Balance Summary",
  ): Promise<void> {
    console.log(`\n=== ${label} ===`);
    console.log(`Address: ${address}`);

    for (const chainId of chainIds) {
      try {
        const balance = await this.getUsdcBalance(chainId, address);
        const chainName = this.getChainName(chainId);
        console.log(`${chainName}: ${formatUsdc(balance)}`);
      } catch (error) {
        const chainName = this.getChainName(chainId);
        console.log(`${chainName}: Error - ${error}`);
      }
    }
    console.log("========================\n");
  }
}
