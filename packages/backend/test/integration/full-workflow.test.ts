import { describe, it, expect } from "vitest";
import { TestHelpers } from "./utils/test-helpers";
import { createTestApiClient } from "./utils/api-client";
import { waitForServiceReady } from "./setup/test-env";
import { TEST_CONFIG } from "./setup/test-config";

describe("Universal Deposit Integration Tests", () => {
  it(
    "should complete full cross-chain workflow: Gnosis → EDU → Gnosis & Gnosis -> Arbitrum -> Gnosis",
    async () => {
      // Wait for API service to be ready
      console.log("⏳ Waiting for API service to be ready...");
      await waitForServiceReady(`${TEST_CONFIG.API_BASE_URL}/api/v1/health`);
      console.log("✅ API service is ready");

      // Verify test environment
      await TestHelpers.verifyTestEnvironment();

      // Create API client
      const apiClient = await createTestApiClient();

      // Execute all workflows
      const results = await TestHelpers.executeAllWorkflows(apiClient);

      // Generate test report
      TestHelpers.generateTestReport(results);

      // Assert no workflows failed (excluding skipped ones)
      const failedWorkflows = results.filter((r) => !r.success && !r.skipped);
      if (failedWorkflows.length > 0) {
        const firstFailure = failedWorkflows[0];
        if (firstFailure) {
          throw new Error(
            `Workflow "${firstFailure.workflow.name}" failed: ${firstFailure.error}`,
          );
        }
      }

      // Assert all executed transfers were within tolerance
      const executedWorkflows = results.filter((r) => r.success);
      const outOfToleranceWorkflows = executedWorkflows.filter(
        (r) => !r.withinTolerance,
      );
      if (outOfToleranceWorkflows.length > 0) {
        const firstOutOfTolerance = outOfToleranceWorkflows[0];
        if (firstOutOfTolerance) {
          throw new Error(
            `Workflow "${firstOutOfTolerance.workflow.name}" completed but transfer amount was outside tolerance`,
          );
        }
      }

      // Assert we have results for all expected workflows
      expect(results).toHaveLength(TEST_CONFIG.WORKFLOWS.length);

      // If we get here, either all workflows passed or some were skipped due to earlier failures
      const skippedWorkflows = results.filter((r) => r.skipped);
      if (skippedWorkflows.length === 0) {
        console.log("🎉 All integration tests passed!");
      } else {
        console.log(
          `✅ Executed workflows passed, but ${skippedWorkflows.length} were skipped due to earlier failure`,
        );
      }
    },
    {
      timeout: TEST_CONFIG.TIMEOUT_MS,
    },
  );
});
