import { type Address } from "viem";
import { TestEnvironment } from "../setup/test-env";
import { TEST_CONFIG } from "../setup/test-config";

/**
 * API client for integration tests
 */
export class ApiClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string = TEST_CONFIG.API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Set API key for authenticated requests
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Make HTTP request with proper headers
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create a new client using master key
   */
  async createClient(name: string): Promise<{
    id: string;
    name: string;
    apiKey: string;
    isActive: boolean;
    createdAt: string;
  }> {
    const masterKey = TestEnvironment.getMasterKey();

    const response = await fetch(`${this.baseUrl}/api/v1/admin/clients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": masterKey,
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create client: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json() as Promise<{
      id: string;
      name: string;
      apiKey: string;
      isActive: boolean;
      createdAt: string;
    }>;
  }

  /**
   * Register a Universal Deposit Address
   */
  async registerAddress(params: {
    ownerAddress: Address;
    recipientAddress: Address;
    sourceChainId: number;
    destinationChainId: number;
  }): Promise<{ universalAddress: Address }> {
    if (!this.apiKey) {
      throw new Error("API key required for registerAddress");
    }

    return this.request<{ universalAddress: Address }>(
      "/api/v1/register-address",
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  /**
   * Get Universal Deposit Address (without registration)
   */
  async getAddress(params: {
    ownerAddress: Address;
    recipientAddress: Address;
    sourceChainId: number;
    destinationChainId: number;
  }): Promise<{ universalAddress: Address }> {
    if (!this.apiKey) {
      throw new Error("API key required for getAddress");
    }

    const queryParams = new URLSearchParams({
      ownerAddress: params.ownerAddress,
      recipientAddress: params.recipientAddress,
      sourceChainId: params.sourceChainId.toString(),
      destinationChainId: params.destinationChainId.toString(),
    });

    return this.request<{ universalAddress: Address }>(
      `/api/v1/address?${queryParams}`,
    );
  }

  /**
   * Get current client information
   */
  async getMe(): Promise<{
    id: string;
    name: string;
    isActive: boolean;
    isMaster: boolean;
  }> {
    if (!this.apiKey) {
      throw new Error("API key required for getMe");
    }

    return this.request<{
      id: string;
      name: string;
      isActive: boolean;
      isMaster: boolean;
    }>("/api/v1/me");
  }

  /**
   * Check API health
   */
  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    return this.request<{ status: string; timestamp: string }>(
      "/api/v1/health",
    );
  }

  /**
   * Get orders (if endpoint exists)
   */
  async getOrders(params?: {
    universalAddress?: Address;
    sourceChainId?: number;
    nonce?: number;
  }): Promise<any> {
    if (!this.apiKey) {
      throw new Error("API key required for getOrders");
    }

    let endpoint = "/api/v1/orders";
    if (params) {
      const queryParams = new URLSearchParams();
      if (params.universalAddress) {
        queryParams.set("universalAddress", params.universalAddress);
      }
      if (params.sourceChainId) {
        queryParams.set("sourceChainId", params.sourceChainId.toString());
      }
      if (params.nonce) {
        queryParams.set("nonce", params.nonce.toString());
      }
      if (queryParams.toString()) {
        endpoint += `?${queryParams}`;
      }
    }

    return this.request<any>(endpoint);
  }
}

/**
 * Create and setup API client for testing
 */
export async function createTestApiClient(
  clientName: string = "integration-test-client",
): Promise<ApiClient> {
  const client = new ApiClient();

  console.log("Creating test client...");
  const clientInfo = await client.createClient(clientName);
  console.log(`✅ Created client: ${clientInfo.name} (${clientInfo.id})`);

  client.setApiKey(clientInfo.apiKey);
  console.log("✅ API client configured with new API key");

  // Verify client works
  const me = await client.getMe();
  console.log(`✅ Client verified: ${me.name} (active: ${me.isActive})`);

  return client;
}
