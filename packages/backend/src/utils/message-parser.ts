import { logger } from "./logger";

/**
 * Parse RabbitMQ message content handling nested Buffer serialization
 * This handles the double serialization issue where:
 * 1. Publishers use Buffer.from(JSON.stringify(payload))
 * 2. Connection uses json: true which serializes the Buffer again
 * 3. Result is a Buffer containing JSON representation of another Buffer
 */
export function parseMessagePayload<T = any>(content: Buffer): T | null {
  try {
    const contentStr = content.toString();
    const parsed = JSON.parse(contentStr);

    // Check if it's a Buffer representation object from double serialization
    if (parsed.type === "Buffer" && Array.isArray(parsed.data)) {
      // Convert Buffer data array back to Buffer, then to string, then parse JSON
      const innerBuffer = Buffer.from(parsed.data);
      return JSON.parse(innerBuffer.toString()) as T;
    } else {
      // Direct JSON payload
      return parsed as T;
    }
  } catch (parseErr) {
    logger.error(
      { err: parseErr, content: content.toString() },
      "Failed to parse message payload",
    );
    return null;
  }
}
