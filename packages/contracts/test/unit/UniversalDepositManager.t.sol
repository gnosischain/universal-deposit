// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {UniversalDepositManager} from '../../src/UniversalDepositManager.sol';
import {Test} from 'forge-std/Test.sol';

/**
 * @title UniversalDepositManagerTest
 * @notice Unit tests for UniversalDepositManager contract functionality
 * @dev Tests route configuration, token support, and access control
 */
contract UniversalDepositManagerTest is Test {
  address owner = makeAddr('owner');
  UniversalDepositManager universalDepositManager;

  function setUp() public {
    universalDepositManager = new UniversalDepositManager();
    assertEq(universalDepositManager.owner(), address(this));

    universalDepositManager.transferOwnership(owner);
    assertEq(universalDepositManager.owner(), owner);
  }

  /**
   * @notice Test basic token route configuration
   * @dev Verifies route setting, token support, and route validation
   */
  function testTokenRoute(uint256 srcChainId, uint256 dstChainId) public {
    address srcToken = makeAddr('srcToken');
    address dstToken = makeAddr('dstToken');

    UniversalDepositManager.TokenRoute memory tokenRoute = UniversalDepositManager.TokenRoute({
      srcToken: srcToken,
      dstToken: dstToken,
      srcChainId: srcChainId,
      dstChainId: dstChainId
    });

    vm.prank(owner);
    universalDepositManager.setRoute(tokenRoute);

    assertTrue(universalDepositManager.isTokenSupported(srcToken));
    assertTrue(universalDepositManager.isRouteSupported(universalDepositManager.getRouteKey(tokenRoute)));
    assertTrue(universalDepositManager.getRoute(srcToken).dstToken == dstToken);
    assertTrue(universalDepositManager.getRoute(srcToken).srcChainId == srcChainId);
    assertTrue(universalDepositManager.getRoute(srcToken).dstChainId == dstChainId);
    assertFalse(universalDepositManager.isTokenSupported(dstToken));
  }

  /**
   * @notice Test complete Stargate route configuration
   * @dev Verifies Stargate route setting, EID mapping, and validation
   */
  function testStargateRoute(uint256 srcChainId, uint256 dstChainId, uint32 srcEid, uint32 dstEid) public {
    vm.assume(srcChainId != dstChainId);
    vm.assume(srcEid != dstEid);
    address srcStargateToken = makeAddr('srcStargateToken');
    address dstStargateToken = makeAddr('dstStargateToken');
    address srcToken = makeAddr('srcToken');
    address dstToken = makeAddr('dstToken');

    UniversalDepositManager.StargateTokenRoute memory stargateRoute = UniversalDepositManager.StargateTokenRoute({
      srcStargateToken: srcStargateToken,
      dstStargateToken: dstStargateToken,
      srcEid: srcEid,
      dstEid: dstEid,
      tokenRoute: UniversalDepositManager.TokenRoute({
        srcToken: srcToken,
        dstToken: dstToken,
        srcChainId: srcChainId,
        dstChainId: dstChainId
      })
    });

    vm.startPrank(owner);
    universalDepositManager.setStargateRoute(stargateRoute);
    universalDepositManager.setChainIdEid(srcChainId, srcEid);
    universalDepositManager.setChainIdEid(dstChainId, dstEid);

    assertTrue(universalDepositManager.isTokenSupported(stargateRoute.tokenRoute.srcToken));
    assertFalse(universalDepositManager.isTokenSupported(stargateRoute.srcStargateToken));
    assertFalse(universalDepositManager.isTokenSupported(stargateRoute.dstStargateToken));
    assertTrue(universalDepositManager.isRouteSupported(universalDepositManager.getRouteKey(stargateRoute.tokenRoute)));
    assertTrue(
      universalDepositManager.getStargateRoute(stargateRoute.tokenRoute.srcToken).srcStargateToken
        == stargateRoute.srcStargateToken
    );
    assertTrue(
      universalDepositManager.getStargateRoute(stargateRoute.tokenRoute.srcToken).dstStargateToken
        == stargateRoute.dstStargateToken
    );
    assertTrue(
      universalDepositManager.getStargateRoute(stargateRoute.tokenRoute.srcToken).srcEid == stargateRoute.srcEid
    );
    assertTrue(
      universalDepositManager.getStargateRoute(stargateRoute.tokenRoute.srcToken).dstEid == stargateRoute.dstEid
    );
    assertTrue(
      universalDepositManager.getStargateRoute(stargateRoute.tokenRoute.srcToken).tokenRoute.srcToken
        == stargateRoute.tokenRoute.srcToken
    );
    assertTrue(
      universalDepositManager.getStargateRoute(stargateRoute.tokenRoute.srcToken).tokenRoute.dstToken
        == stargateRoute.tokenRoute.dstToken
    );
    assertTrue(
      universalDepositManager.getStargateRoute(stargateRoute.tokenRoute.srcToken).tokenRoute.srcChainId
        == stargateRoute.tokenRoute.srcChainId
    );
    assertTrue(
      universalDepositManager.getStargateRoute(stargateRoute.tokenRoute.srcToken).tokenRoute.dstChainId
        == stargateRoute.tokenRoute.dstChainId
    );
    assertEq(universalDepositManager.chainIdToEidMap(srcChainId), srcEid);
    assertEq(universalDepositManager.chainIdToEidMap(dstChainId), dstEid);
  }

  function testOwnership(
    address _newOwner
  ) public {
    address srcStargateToken = makeAddr('srcStargateToken');
    address dstStargateToken = makeAddr('dstStargateToken');
    address srcToken = makeAddr('srcToken');
    address dstToken = makeAddr('dstToken');

    UniversalDepositManager.StargateTokenRoute memory stargateRoute = UniversalDepositManager.StargateTokenRoute({
      srcStargateToken: srcStargateToken,
      dstStargateToken: dstStargateToken,
      srcEid: 30_145,
      dstEid: 30_101,
      tokenRoute: UniversalDepositManager.TokenRoute({
        srcToken: srcToken,
        dstToken: dstToken,
        srcChainId: 100,
        dstChainId: 1
      })
    });

    vm.prank(_newOwner);
    vm.expectRevert();
    universalDepositManager.setStargateRoute(stargateRoute);

    vm.prank(owner);
    universalDepositManager.setStargateRoute(stargateRoute);
  }
}
