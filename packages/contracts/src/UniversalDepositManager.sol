// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

/**
 * @title UniversalDepositManager
 * @author gnosis
 * @notice Central registry contract that manages routing configurations for cross-chain token transfers
 * @dev This contract serves as the source of truth for supported tokens, chains, and routing configurations.
 *      It maps source tokens to destination tokens across different chains and manages Stargate-specific routing.
 */
contract UniversalDepositManager is Ownable {
  /**
   * @notice Basic token routing configuration between chains
   * @param srcToken Address of the source token on the source chain
   * @param dstToken Address of the destination token on the destination chain
   * @param srcChainId Standard chain ID of the source chain
   * @param dstChainId Standard chain ID of the destination chain
   */
  struct TokenRoute {
    address srcToken;
    address dstToken;
    uint256 srcChainId;
    uint256 dstChainId;
  }

  /**
   * @notice Stargate-specific routing configuration that extends TokenRoute
   * @param srcStargateToken Address of the Stargate pool/OFT on the source chain
   * @param dstStargateToken Address of the Stargate pool/OFT on the destination chain
   * @param srcEid LayerZero endpoint ID for the source chain
   * @param dstEid LayerZero endpoint ID for the destination chain
   * @param tokenRoute The underlying token route configuration
   */
  struct StargateTokenRoute {
    address srcStargateToken;
    address dstStargateToken;
    uint32 srcEid;
    uint32 dstEid;
    TokenRoute tokenRoute;
  }

  /// @notice Maps standard chain IDs to LayerZero endpoint IDs
  mapping(uint256 => uint32) public chainIdToEidMap;

  /// @notice Tracks which routing paths are supported (based on route hash)
  mapping(bytes32 => bool) public isRouteSupported;

  /// @notice Tracks which tokens are supported for bridging
  mapping(address => bool) public isTokenSupported;

  /// @notice Maps source token addresses to their routing configurations
  mapping(address srcToken => TokenRoute tokenRoute) public tokenRouteMap;

  /// @notice Maps source token addresses to their Stargate-specific routing configurations
  mapping(address srcToken => StargateTokenRoute stargateTokenRoute) public stargateTokenRouteMap;

  /**
   * @notice Sets up a basic token route between chains
   * @dev Only callable by the contract owner. Updates multiple mappings atomically.
   * @param tokenRoute The token routing configuration to set
   */
  function setRoute(
    TokenRoute calldata tokenRoute
  ) public onlyOwner {
    tokenRouteMap[tokenRoute.srcToken] = tokenRoute;
    isTokenSupported[tokenRoute.srcToken] = true;
    bytes32 routeKey = getRouteKey(tokenRoute);
    isRouteSupported[routeKey] = true;
  }

  /**
   * @notice Sets up a Stargate-specific token route with pool/OFT addresses and endpoint IDs
   * @dev Only callable by the contract owner. Also calls setRoute() internally.
   * @param stargateTokenRoute The Stargate routing configuration to set
   */
  function setStargateRoute(
    StargateTokenRoute calldata stargateTokenRoute
  ) public onlyOwner {
    stargateTokenRouteMap[stargateTokenRoute.tokenRoute.srcToken] = stargateTokenRoute;
    setRoute(stargateTokenRoute.tokenRoute);
  }

  /**
   * @notice Maps a standard chain ID to its corresponding LayerZero endpoint ID
   * @dev Only callable by the contract owner. Required for Stargate integration.
   * @param chainId The standard chain ID (e.g., 1 for Ethereum mainnet)
   * @param eid The LayerZero endpoint ID for the chain
   */
  function setChainIdEid(uint256 chainId, uint32 eid) public onlyOwner {
    chainIdToEidMap[chainId] = eid;
  }

  /**
   * @notice Generates a unique hash key for a token route
   * @dev Used internally to track route support status
   * @param tokenRoute The token route to generate a key for
   * @return bytes32 The unique hash key for the route
   */
  function getRouteKey(
    TokenRoute calldata tokenRoute
  ) public pure returns (bytes32) {
    bytes32 routeKey =
      keccak256(abi.encode(tokenRoute.srcToken, tokenRoute.dstToken, tokenRoute.srcChainId, tokenRoute.dstChainId));
    return routeKey;
  }

  /**
   * @notice Retrieves the basic token route configuration for a source token
   * @param srcToken The source token address to look up
   * @return tokenRoute The token route configuration
   */
  function getRoute(
    address srcToken
  ) public view returns (TokenRoute memory tokenRoute) {
    return tokenRouteMap[srcToken];
  }

  /**
   * @notice Retrieves the Stargate-specific route configuration for a source token
   * @param srcToken The source token address to look up
   * @return stargateTokenRoute The Stargate routing configuration
   */
  function getStargateRoute(
    address srcToken
  ) public view returns (StargateTokenRoute memory stargateTokenRoute) {
    return stargateTokenRouteMap[srcToken];
  }
}
