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

  function chainIdToEidMap(
    uint256
  ) external view returns (uint32);
  function getRoute(
    address srcToken
  ) external returns (TokenRoute memory);
  function getRouteKey(
    TokenRoute memory tokenRoute
  ) external pure returns (bytes32);
  function getStargateRoute(
    address srcToken
  ) external returns (StargateTokenRoute memory stargateTokenRoute);
  function isRouteSupported(
    bytes32
  ) external view returns (bool);
  function isTokenSupported(
    address
  ) external view returns (bool);
  function queryIfRouteSupported(
    TokenRoute memory tokenRoute
  ) external view returns (bool);
  function setChainIdEid(uint256 chainId, uint32 eid) external;
  function setRoute(
    TokenRoute[] memory tokenRoutes
  ) external;
  function setStargateRoute(
    StargateTokenRoute memory stargateTokenRoute
  ) external;
  function stargateTokenRouteMap(
    address
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
  function tokenRouteMap(
    uint256,
    address
  ) external view returns (address srcToken, address dstToken, uint256 srcChainId, uint256 dstChainId, address bridge);
}
