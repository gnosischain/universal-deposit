import { TEST_CONFIG } from "../setup/test-config";

/**
 * Error types that should trigger a retry
 */
const RETRYABLE_ERROR_PATTERNS = [
  // Network errors
  /network error/i,
  /connection error/i,
  /timeout/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /ETIMEDOUT/i,

  // RPC provider errors
  /rate limit/i,
  /too many requests/i,
  /service unavailable/i,
  /internal server error/i,
  /bad gateway/i,
  /gateway timeout/i,

  // Blockchain specific errors
  /execution reverted/i,
  /insufficient funds for gas/i,
  /nonce too low/i,
  /replacement transaction underpriced/i,

  // HTTP status codes
  /status code 429/i, // Rate limited
  /status code 502/i, // Bad gateway
  /status code 503/i, // Service unavailable
  /status code 504/i, // Gateway timeout
];

/**
 * Check if an error should trigger a retry
 */
function isRetryableError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(errorMessage));
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay for retry attempt with exponential backoff
 */
function calculateDelay(attempt: number): number {
  const { BASE_DELAY_MS, BACKOFF_MULTIPLIER, MAX_DELAY_MS } =
    TEST_CONFIG.RPC_RETRY;

  const delay = BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1);
  return Math.min(delay, MAX_DELAY_MS);
}

/**
 * Generic retry wrapper for RPC operations
 */
export async function withRpcRetry<T>(
  operation: () => Promise<T>,
  operationName: string = "RPC operation",
): Promise<T> {
  const { MAX_ATTEMPTS } = TEST_CONFIG.RPC_RETRY;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await operation();

      // Log successful retry if it wasn't the first attempt
      if (attempt > 1) {
        console.log(
          `✅ ${operationName} succeeded on attempt ${attempt}/${MAX_ATTEMPTS}`,
        );
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if this is the last attempt
      if (attempt === MAX_ATTEMPTS) {
        console.error(
          `❌ ${operationName} failed after ${MAX_ATTEMPTS} attempts:`,
          error,
        );
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        console.error(
          `❌ ${operationName} failed with non-retryable error:`,
          error,
        );
        throw error;
      }

      // Calculate delay and log retry attempt
      const delay = calculateDelay(attempt);
      console.warn(
        `⚠️ ${operationName} failed on attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${delay}ms:`,
        error instanceof Error ? error.message : String(error),
      );

      await sleep(delay);
    }
  }

  // If we get here, all attempts failed
  throw lastError;
}

/**
 * Retry wrapper specifically for balance checks
 */
export async function withBalanceRetry<T>(
  operation: () => Promise<T>,
  address: string,
  chainId: number,
): Promise<T> {
  return withRpcRetry(
    operation,
    `Balance check for ${address} on chain ${chainId}`,
  );
}

/**
 * Retry wrapper specifically for contract reads
 */
export async function withContractReadRetry<T>(
  operation: () => Promise<T>,
  contractAddress: string,
  functionName: string,
  chainId: number,
): Promise<T> {
  return withRpcRetry(
    operation,
    `Contract read ${contractAddress}.${functionName}() on chain ${chainId}`,
  );
}

/**
 * Retry wrapper specifically for transaction sending
 */
export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  operationDescription: string,
  chainId: number,
): Promise<T> {
  return withRpcRetry(
    operation,
    `Transaction: ${operationDescription} on chain ${chainId}`,
  );
}
