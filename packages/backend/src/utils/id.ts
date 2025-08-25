import type { Address } from "viem";
import { encodePacked, keccak256, getAddress } from "viem";

export type OrderIdParams = {
  universalAddress: string;
  ownerAddress: string;
  recipientAddress: string;
  destinationTokenAddress: string;
  destinationChainId: number | bigint;
  nonce: number | bigint;
};

/**
 * Normalize an EVM address to checksum format.
 */
function normAddr(addr: string): Address {
  return getAddress(addr);
}

/**
 * Generate deterministic Order ID per spec:
 * keccak256(universalAddress, ownerAddress, recipientAddress, destinationToken, destinationChainId, nonce)
 * All addresses are checksummed; chainId and nonce encoded as uint256.
 */
export function generateOrderId(params: OrderIdParams): `0x${string}` {
  const packed = encodePacked(
    ["address", "address", "address", "address", "uint256", "uint256"],
    [
      normAddr(params.universalAddress),
      normAddr(params.ownerAddress),
      normAddr(params.recipientAddress),
      normAddr(params.destinationTokenAddress),
      BigInt(params.destinationChainId),
      BigInt(params.nonce),
    ],
  );
  return keccak256(packed);
}
