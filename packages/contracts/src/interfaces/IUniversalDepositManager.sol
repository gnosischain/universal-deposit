// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

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

    function chainIdToEidMap(uint256) external view returns (uint32);
    function getRoute(address srcToken) external view returns (TokenRoute memory tokenRoute);
    function getRouteKey(TokenRoute memory tokenRoute) external pure returns (bytes32);
    function getStargateRoute(address srcToken) external view returns (StargateTokenRoute memory stargateTokenRoute);
    function isRouteSupported(bytes32) external view returns (bool);
    function isTokenSupported(address) external view returns (bool);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function setChainIdEid(uint256 chainId, uint32 eid) external;
    function setRoute(TokenRoute memory tokenRoute) external;
    function setStargateRoute(StargateTokenRoute memory stargateTokenRoute) external;
    function stargateTokenRouteMap(address srcToken)
        external
        view
        returns (
            address srcStargateToken,
            address dstStargateToken,
            uint32 srcEid,
            uint32 dstEid,
            TokenRoute memory tokenRoute
        );
    function tokenRouteMap(address srcToken)
        external
        view
        returns (address _srcToken, address dstToken, uint256 srcChainId, uint256 dstChainId);
    function transferOwnership(address newOwner) external;
}
