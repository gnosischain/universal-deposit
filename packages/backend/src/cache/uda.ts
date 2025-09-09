import { redis } from "./redis";

export type UDARecord = {
  universalAddress: string;
  ownerAddress: string;
  recipientAddress: string;
  destinationChainId: number;
  sourceChainId: number;
  lastProcessedNonce: bigint; // -1n if none processed yet
  lastDetectedBalance: bigint; // last observed balance on source chain
  createdAt: string; // ISO
  updatedAt: string; // ISO
  clientId?: string; // Client ID that registered this UDA
};

export const UDA_INDEX_KEY = "uda:index";

function keyFor(address: string): string {
  return `uda:${address.toLowerCase()}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Register or refresh a UDA entry with TTL. Called from /register-address only.
 * TTL is set to ttlSeconds (e.g., 24h). TTL is NOT refreshed by the watcher.
 */
export async function registerOrRefreshUDA(params: {
  universalAddress: string;
  ownerAddress: string;
  recipientAddress: string;
  destinationChainId: number;
  sourceChainId: number;
  ttlSeconds: number;
  clientId?: string;
}): Promise<void> {
  const k = keyFor(params.universalAddress);

  // Read existing state to preserve lastProcessedNonce/lastDetectedBalance/createdAt when present
  const [existingLastNonce, existingLastBal, existingCreatedAt] =
    await Promise.all([
      redis.hget(k, "lastProcessedNonce"),
      redis.hget(k, "lastDetectedBalance"),
      redis.hget(k, "createdAt"),
    ]);

  const createdAt = existingCreatedAt ?? nowISO();
  const updatedAt = nowISO();

  const udaData: Record<string, string> = {
    universalAddress: params.universalAddress,
    ownerAddress: params.ownerAddress,
    recipientAddress: params.recipientAddress,
    destinationChainId: String(params.destinationChainId),
    sourceChainId: String(params.sourceChainId),
    lastProcessedNonce: existingLastNonce ?? "-1",
    lastDetectedBalance: existingLastBal ?? "0",
    createdAt,
    updatedAt,
  };

  if (params.clientId) {
    udaData.clientId = params.clientId;
  }

  await redis
    .multi()
    .hset(k, udaData)
    .expire(k, params.ttlSeconds)
    .sadd(UDA_INDEX_KEY, params.universalAddress.toLowerCase())
    .exec();
}

/**
 * Get a UDA record. Returns null if required fields are missing
 * or the hash is empty (expired).
 */
export async function getUDA(
  universalAddress: string,
): Promise<UDARecord | null> {
  const k = keyFor(universalAddress);
  const res = await redis.hgetall(k);
  if (!res || Object.keys(res).length === 0) return null;

  // Ensure required fields exist; otherwise treat as missing/expired
  if (
    !res.ownerAddress ||
    !res.recipientAddress ||
    !res.destinationChainId ||
    !res.sourceChainId
  ) {
    return null;
  }

  return {
    universalAddress: res.universalAddress ?? universalAddress,
    ownerAddress: res.ownerAddress,
    recipientAddress: res.recipientAddress,
    destinationChainId: Number(res.destinationChainId),
    sourceChainId: Number(res.sourceChainId),
    lastProcessedNonce: BigInt(res.lastProcessedNonce ?? "-1"),
    lastDetectedBalance: BigInt(res.lastDetectedBalance ?? "0"),
    createdAt: res.createdAt ?? nowISO(),
    updatedAt: res.updatedAt ?? nowISO(),
    clientId: res.clientId || undefined,
  };
}

/**
 * List all UDA addresses registered in the index.
 * Note: The index may contain stale members (expired hashes). Call pruneIndex on empty hashes.
 */
export async function listUDAAddresses(): Promise<string[]> {
  const members = await redis.smembers(UDA_INDEX_KEY);
  return members ?? [];
}

/**
 * Update state fields for a UDA (does not touch TTL).
 */
export async function updateUDAState(
  universalAddress: string,
  updates: Partial<
    Pick<UDARecord, "lastProcessedNonce" | "lastDetectedBalance">
  >,
): Promise<void> {
  const k = keyFor(universalAddress);
  const payload: Record<string, string> = {
    updatedAt: nowISO(),
  };
  if (updates.lastProcessedNonce !== undefined) {
    payload.lastProcessedNonce = updates.lastProcessedNonce.toString();
  }
  if (updates.lastDetectedBalance !== undefined) {
    payload.lastDetectedBalance = updates.lastDetectedBalance.toString();
  }
  await redis.hset(k, payload);
}

/**
 * Remove an address from the index set (used when hash expired).
 */
export async function pruneIndex(universalAddress: string): Promise<void> {
  await redis.srem(UDA_INDEX_KEY, universalAddress.toLowerCase());
}
