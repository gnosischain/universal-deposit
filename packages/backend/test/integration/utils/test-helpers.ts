import { type Address } from "viem";
import { BlockchainUtils } from "./blockchain-utils";
import { ApiClient } from "./api-client";
import {
  TestEnvironment,
  formatUsdc,
  isWithinTolerance,
} from "../setup/test-env";
import { TEST_CONFIG, type TestWorkflow } from "../setup/test-config";

/**
 * Test result interface
 */
export interface WorkflowTestResult {
  workflow: TestWorkflow;
  success: boolean;
  skipped?: boolean;
  universalAddress: Address;
  transferHash: string;
  transferAmount: bigint;
  initialBalance: bigint;
  finalBalance: bigint;
  actualIncrease: bigint;
  withinTolerance: boolean;
  duration: number;
  error?: string;
}

/**
 * Test helpers for integration tests
 */
export class TestHelpers {
  /**
   * Execute a single workflow test
   */
  static async executeWorkflow(
    workflow: TestWorkflow,
    apiClient: ApiClient,
  ): Promise<WorkflowTestResult> {
    const startTime = Date.now();
    const testWalletAddress = BlockchainUtils.getTestWalletAddress();

    console.log(`\n🚀 Starting workflow: ${workflow.name}`);
    console.log(
      `Source: ${workflow.sourceChain} → Destination: ${workflow.destinationChain}`,
    );

    try {
      // Get chain IDs
      const sourceChainId =
        TEST_CONFIG.CHAINS[
          workflow.sourceChain.toUpperCase() as keyof typeof TEST_CONFIG.CHAINS
        ].chainId;
      const destinationChainId =
        TEST_CONFIG.CHAINS[
          workflow.destinationChain.toUpperCase() as keyof typeof TEST_CONFIG.CHAINS
        ].chainId;

      // Step 1: Register UDA address
      console.log("📝 Registering Universal Deposit Address...");
      const { universalAddress } = await apiClient.registerAddress({
        ownerAddress: testWalletAddress,
        recipientAddress: testWalletAddress, // Using same wallet as recipient for testing
        sourceChainId,
        destinationChainId,
      });
      console.log(`✅ UDA registered: ${universalAddress}`);

      // Step 2: Record initial balance on destination chain
      console.log("📊 Recording initial balance on destination chain...");
      const initialBalance = await BlockchainUtils.getUsdcBalance(
        destinationChainId,
        testWalletAddress,
      );
      console.log(`Initial balance: ${formatUsdc(initialBalance)}`);

      // Step 3: Determine transfer amount and send USDC
      let transferAmount: bigint;
      let transferHash: string;

      if (workflow.amount === "FIXED") {
        transferAmount = TEST_CONFIG.INITIAL_TRANSFER_AMOUNT;
        console.log(`💸 Sending fixed amount: ${formatUsdc(transferAmount)}`);
        transferHash = await BlockchainUtils.sendUsdc(
          sourceChainId,
          universalAddress,
          transferAmount,
        );
      } else {
        console.log("💸 Sending full balance...");
        const result = await BlockchainUtils.sendFullUsdcBalance(
          sourceChainId,
          universalAddress,
        );
        transferAmount = result.amount;
        transferHash = result.hash;
        console.log(`Sent full balance: ${formatUsdc(transferAmount)}`);
      }

      // Step 4: Wait for balance change on destination chain
      console.log("⏳ Waiting for cross-chain settlement...");
      const { finalBalance, actualIncrease } =
        await BlockchainUtils.waitForBalanceChange(
          destinationChainId,
          testWalletAddress,
          initialBalance,
          transferAmount,
        );

      // Step 5: Verify balance increase is within tolerance
      const withinTolerance = isWithinTolerance(
        transferAmount,
        actualIncrease,
        TEST_CONFIG.BALANCE_TOLERANCE_BPS,
      );

      const duration = Date.now() - startTime;

      console.log(`✅ Workflow completed in ${duration}ms`);
      console.log(`Transfer amount: ${formatUsdc(transferAmount)}`);
      console.log(`Actual increase: ${formatUsdc(actualIncrease)}`);
      console.log(`Within tolerance: ${withinTolerance ? "✅" : "❌"}`);

      return {
        workflow,
        success: true,
        universalAddress,
        transferHash,
        transferAmount,
        initialBalance,
        finalBalance,
        actualIncrease,
        withinTolerance,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(`❌ Workflow failed after ${duration}ms: ${errorMessage}`);

      return {
        workflow,
        success: false,
        universalAddress:
          "0x0000000000000000000000000000000000000000" as Address,
        transferHash: "",
        transferAmount: 0n,
        initialBalance: 0n,
        finalBalance: 0n,
        actualIncrease: 0n,
        withinTolerance: false,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute all workflows sequentially with fail-fast behavior
   */
  static async executeAllWorkflows(
    apiClient: ApiClient,
  ): Promise<WorkflowTestResult[]> {
    const results: WorkflowTestResult[] = [];
    const testWalletAddress = BlockchainUtils.getTestWalletAddress();

    console.log("🎯 Starting full integration test suite");
    console.log(`Test wallet: ${testWalletAddress}`);

    // Log initial balances
    await BlockchainUtils.logBalanceSummary(
      testWalletAddress,
      [
        TEST_CONFIG.CHAINS.GNOSIS.chainId,
        TEST_CONFIG.CHAINS.ARBITRUM.chainId,
        TEST_CONFIG.CHAINS.EDU.chainId,
      ],
      "Initial Balances",
    );

    // Execute workflows sequentially with fail-fast behavior
    let workflowFailed = false;
    for (let i = 0; i < TEST_CONFIG.WORKFLOWS.length; i++) {
      const workflow = TEST_CONFIG.WORKFLOWS[i];
      if (!workflow) continue; // Safety check

      if (workflowFailed) {
        // Skip remaining workflows if a previous one failed
        console.log(
          `⏭️  Skipping workflow: ${workflow.name} (previous workflow failed)`,
        );
        const skippedResult: WorkflowTestResult = {
          workflow,
          success: false,
          skipped: true,
          universalAddress:
            "0x0000000000000000000000000000000000000000" as Address,
          transferHash: "",
          transferAmount: 0n,
          initialBalance: 0n,
          finalBalance: 0n,
          actualIncrease: 0n,
          withinTolerance: false,
          duration: 0,
          error: "Skipped due to previous workflow failure",
        };
        results.push(skippedResult);
        continue;
      }

      const result = await this.executeWorkflow(workflow, apiClient);
      results.push(result);

      // If a workflow fails, mark flag to skip remaining workflows
      if (!result.success) {
        workflowFailed = true;
        console.error(
          `❌ Workflow ${workflow.name} failed! Remaining workflows will be skipped.`,
        );
        console.error(`Error: ${result.error}`);
        // Don't break here - let the loop continue to mark remaining workflows as skipped
      } else {
        // Small delay between successful workflows (but not if this was the last one or if we're about to skip)
        if (i < TEST_CONFIG.WORKFLOWS.length - 1) {
          console.log("⏸️  Waiting 5 seconds before next workflow...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }

    // Log final balances only if we executed at least one workflow
    if (results.some((r) => !r.skipped)) {
      await BlockchainUtils.logBalanceSummary(
        testWalletAddress,
        [
          TEST_CONFIG.CHAINS.GNOSIS.chainId,
          TEST_CONFIG.CHAINS.ARBITRUM.chainId,
          TEST_CONFIG.CHAINS.EDU.chainId,
        ],
        "Final Balances",
      );
    }

    return results;
  }

  /**
   * Generate test report
   */
  static generateTestReport(results: WorkflowTestResult[]): void {
    console.log("\n" + "=".repeat(60));
    console.log("📊 INTEGRATION TEST REPORT");
    console.log("=".repeat(60));

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success && !r.skipped);
    const skipped = results.filter((r) => r.skipped);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Total workflows: ${results.length}`);
    console.log(`Successful: ${successful.length} ✅`);
    console.log(`Failed: ${failed.length} ${failed.length > 0 ? "❌" : ""}`);
    console.log(`Skipped: ${skipped.length} ${skipped.length > 0 ? "⏭️" : ""}`);
    console.log(
      `Total duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`,
    );

    console.log("\n📋 Workflow Details:");
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.workflow.name}`);

      if (result.skipped) {
        console.log(`   Status: ⏭️ SKIPPED`);
        console.log(`   Reason: ${result.error}`);
      } else if (result.success) {
        console.log(`   Status: ✅ SUCCESS`);
        console.log(`   Duration: ${result.duration}ms`);
        console.log(`   Transfer: ${formatUsdc(result.transferAmount)}`);
        console.log(`   Received: ${formatUsdc(result.actualIncrease)}`);
        console.log(
          `   Tolerance: ${result.withinTolerance ? "✅ Within" : "❌ Outside"}`,
        );
        console.log(`   TX Hash: ${result.transferHash}`);
      } else {
        console.log(`   Status: ❌ FAILED`);
        console.log(`   Duration: ${result.duration}ms`);
        console.log(`   Error: ${result.error}`);
      }
    });

    if (failed.length > 0) {
      console.log("\n❌ FAILED WORKFLOWS:");
      failed.forEach((result) => {
        console.log(`- ${result.workflow.name}: ${result.error}`);
      });
    }

    if (skipped.length > 0) {
      console.log("\n⏭️ SKIPPED WORKFLOWS:");
      skipped.forEach((result) => {
        console.log(`- ${result.workflow.name}: ${result.error}`);
      });
    }

    console.log("\n" + "=".repeat(60));
    const hasFailures = failed.length > 0;
    console.log(
      `🎯 OVERALL RESULT: ${hasFailures ? "❌ TESTS FAILED" : "✅ ALL TESTS PASSED"}`,
    );
    if (hasFailures) {
      console.log(`💡 Fix the failed workflow and re-run the tests`);
    }
    console.log("=".repeat(60));
  }

  /**
   * Verify test environment is ready
   */
  static async verifyTestEnvironment(): Promise<void> {
    console.log("🔍 Verifying test environment...");

    // Validate environment variables
    TestEnvironment.validate();
    TestEnvironment.ensureMainnetTxEnabled();
    console.log("✅ Environment variables validated");

    // Verify test wallet has sufficient USDC on Gnosis (starting chain)
    await BlockchainUtils.verifyTestWalletFunding(
      TEST_CONFIG.CHAINS.GNOSIS.chainId,
      TEST_CONFIG.INITIAL_TRANSFER_AMOUNT,
    );

    console.log("✅ Test environment ready");
  }
}
