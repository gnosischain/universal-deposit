// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

contract UniversalDepositManager is Ownable {
  address public constant EDU_STARGATE_OFT_USDC = 0x2d16fde7eC929Fa00c1D373294Ae4c9Ee13F2f0e; // TODO: change
  address public constant EDU_USDCE = 0xa88f8674D4Ec56c7Cf3df60924162c24a876d278; // TODO: change
  address public constant GC_STARGATE_POOL_USDC = 0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3;
  address public constant GC_USDCE = 0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0;
  uint256 public constant EDU_CHAINID = 41_923;
  uint32 public constant EDU_EID = 30_328;
  uint256 public constant GC_CHAINID = 100;
  uint32 public constant GC_EID = 30_145;

  struct TokenRoute {
    address srcToken;
    address dstToken;
    uint256 srcChainId;
    uint256 dstChainId;
  }

  struct StargateTokenRoute {
    address srcStargateToken;
    address dstStargateToken;
    uint32 srcEid;
    uint32 dstEid;
    TokenRoute tokenRoute;
  }

  mapping(uint256 => uint32) public chainIdToEidMap;
  mapping(bytes32 => bool) public isRouteSupported;
  mapping(address => bool) public isTokenSupported;
  mapping(address srcToken => TokenRoute tokenRoute) public tokenRouteMap;
  mapping(address srcStargateToken => StargateTokenRoute stargateTokenRoute) public stargateTokenRouteMap;

  function setRoute(
    TokenRoute calldata tokenRoute
  ) public {
    // setup the token routes
    tokenRouteMap[tokenRoute.srcToken] = tokenRoute;
    isTokenSupported[tokenRoute.srcToken] = true;
  }

  function setStargateRoute(
    StargateTokenRoute calldata stargateTokenRoute
  ) public {
    stargateTokenRouteMap[stargateTokenRoute.tokenRoute.srcToken] = stargateTokenRoute;
    setRouteSupported(stargateTokenRoute.tokenRoute);
  }

  function setChainIdEid(uint256 chainId, uint32 eid) public {
    chainIdToEidMap[chainId] = eid;
  }

  function getRouteKey(
    TokenRoute calldata tokenRoute
  ) public pure returns (bytes32) {
    bytes32 routeKey =
      keccak256(abi.encode(tokenRoute.srcToken, tokenRoute.dstToken, tokenRoute.srcChainId, tokenRoute.dstChainId));
    return routeKey;
  }

  function setRouteSupported(
    TokenRoute calldata tokenRoute
  ) internal {
    bytes32 routeKey = getRouteKey(tokenRoute);
    isRouteSupported[routeKey] = true;
  }

  function getRoute(
    address srcToken
  ) public view returns (TokenRoute memory tokenRoute) {
    return tokenRouteMap[srcToken];
  }

  function getStargateRoute(
    address srcToken
  ) public view returns (StargateTokenRoute memory stargateTokenRoute) {
    return stargateTokenRouteMap[srcToken];
  }
}
