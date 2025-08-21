// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IUniversalDepositManager {
  struct StargateTokenRoute {
    address srcStargateToken;
    address dstStargateToken;
    uint32 srcEid;
    uint32 dstEid;
    TokenRoute tokenRoute;
  }

  struct TokenRoute {
    address srcToken;
    address dstToken;
    uint256 srcChainId;
    uint256 dstChainId;
  }

  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  function chainIdToEidMap(
    uint256
  ) external view returns (uint32);
  function getSGRouteKey(
    StargateTokenRoute memory stargateTokenRoute
  ) external pure returns (bytes32);
  function getStargateRoute(
    address srcToken,
    uint256 dstChainId
  ) external view returns (StargateTokenRoute memory stargateTokenRoute);
  function isSGRouteSupported(
    bytes32
  ) external view returns (bool);
  function isSrcTokenSupported(
    address
  ) external view returns (bool);
  function owner() external view returns (address);
  function renounceOwnership() external;
  function setChainIdEid(uint256 chainId, uint32 eid) external;
  function setStargateRoute(
    StargateTokenRoute memory stargateTokenRoute
  ) external;
  function stargateTokenRouteMap(
    address srcToken,
    uint256 dstChainId
  )
    external
    view
    returns (
      address srcStargateToken,
      address dstStargateToken,
      uint32 srcEid,
      uint32 dstEid,
      TokenRoute memory tokenRoute
    );
  function transferOwnership(
    address newOwner
  ) external;
}
