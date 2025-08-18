// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ProxyFactory} from '../../src/ProxyFactory.sol';
import {UniversalDepositAccount} from '../../src/UniversalDepositAccount.sol';
import {UniversalDepositManager} from '../../src/UniversalDepositManager.sol';
import {IUniversalDepositAccount} from '../../src/interfaces/IUniversalDepositAccount.sol';
import {ERC20} from '../../src/test/ERC20.sol';
import {Utils} from '../../src/utils/Utils.sol';
import {StargateBase} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/StargateBase.sol';
import {IStargatePool} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/interfaces/IStargatePool.sol';
import {OFTTokenERC20} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/utils/OFTTokenERC20.sol';
import {
  StargateFixture,
  StargateTestHelper
} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/test/StargateTestHelper.sol';
import {Test} from 'forge-std/Test.sol';

/**
 * @title UniversalDepositAccountTest
 * @notice Unit tests for UniversalDepositAccount contract using Stargate V2 test framework
 * @dev Tests settlement, fee quotation, and token withdrawal functionality
 */
contract UniversalDepositAccountTest is StargateTestHelper, Test {
  address alice = makeAddr('alice'); // alice is owner and recipient of her account
  address caller = makeAddr('caller');
  UniversalDepositAccount universalDepositImplementation;
  UniversalDepositManager universalDepositManager;
  ProxyFactory proxyFactory;
  uint256 conversionRate = Utils._getStargateConversionRate(18); // decimals is set to 18 in StargateTestHelper.setUpStargate()

  uint8 poolEid = 1;
  uint8 oftEid = 2;
  uint256 poolChainId = 100;
  uint256 oftChainId = 10;

  uint8 internal NUM_ASSETS = 1; // usdc
  uint8 internal NUM_CHAINS = 2;
  uint8 internal NUM_NATIVE_POOLS = 0;
  uint8 internal NUM_OFTS = 1;
  uint8 internal NUM_POOLS = 1;

  uint16 assetId = 1;

  event ETHNotSupported();
  event InsufficientNativeToken(uint256 balance, uint256 required);

  function setUp() external {
    // eid = 1, 2
    // pool eid = 1
    // oft eid = 2
    // asset id = 1
    // With asset Id 1, setup 1 pool token, 1 oft token
    setUpStargate(NUM_ASSETS, NUM_POOLS, NUM_NATIVE_POOLS, NUM_OFTS);

    universalDepositImplementation = new UniversalDepositAccount();
    universalDepositManager = new UniversalDepositManager();
    universalDepositManager.setChainIdEid(poolChainId, poolEid); // source: Pool Chain
    universalDepositManager.setChainIdEid(oftChainId, oftEid); // dst: Hydra OFT Chain
    assertEq(universalDepositManager.chainIdToEidMap(poolChainId), poolEid);
    assertEq(universalDepositManager.chainIdToEidMap(oftChainId), oftEid);

    proxyFactory = new ProxyFactory(address(universalDepositImplementation), address(universalDepositManager));

    vm.deal(alice, 1 ether);
    vm.deal(caller, 1 ether);
  }

  /**
   * @notice Test settlement from Stargate Pool to OFT
   * @dev Verifies bridging from pool-based token to OFT-based token
   */
  function testSettleFromPoolToOFT(
    uint64 _amountSD
  ) external {
    uint256 amountLD = Utils._sd2ld(_amountSD, conversionRate);

    vm.assume(_amountSD > 0 && amountLD < type(uint64).max);

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, oftChainId));
    (StargateFixture memory fixture) = _setupUDManager(true, assetId, poolEid);

    // StargateBase(fixture.stargate).setOFTPath(oftEid, true); // not required, will revert Path_AlreadyHasCredit() error because OFT has UNLIMITED_CREDIT

    ERC20(fixture.token).mint(alice, amountLD);
    assertEq(ERC20(fixture.token).balanceOf(alice), amountLD);

    vm.prank(alice);
    ERC20(fixture.token).transfer(udAccount, amountLD);

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);
    assertEq(ERC20(fixture.token).balanceOf(udAccount), amountLD);

    uint256 initialUdAccountTokenBalance = ERC20(fixture.token).balanceOf(udAccount);

    (uint256 valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(ERC20(fixture.token).balanceOf(udAccount), fixture.stargate);
    assertGe(valueToSend, 0);

    vm.prank(caller);
    vm.expectEmit();
    emit IUniversalDepositAccount.BridgingInitiated(1);
    (, IUniversalDepositAccount.OFTReceipt memory oftReceipt) =
      IUniversalDepositAccount(udAccount).settle{value: valueToSend}(fixture.token);

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    assertEq(ERC20(fixture.token).balanceOf(udAccount), initialUdAccountTokenBalance - oftReceipt.amountSentLD);
    assertEq(IStargatePool(fixture.stargate).poolBalance(), oftReceipt.amountSentLD);
  }

  /**
   * @notice Test settlement from Stargate OFT to Pool
   * @dev Verifies bridging from OFT-based token to pool-based token
   */
  function testSettleFromOFTToPool(
    uint64 _amountSD
  ) external {
    (StargateFixture memory fixture) = _setupUDManager(false, assetId, oftEid);
    vm.assume(_amountSD > 1);
    uint256 amountLD = Utils._sd2ld(_amountSD, conversionRate);
    vm.assume(_amountSD > 0 && amountLD < type(uint64).max);

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, poolChainId));
    StargateBase(fixture.stargate).setOFTPath(poolEid, true);
    OFTTokenERC20(fixture.token).addMinter(fixture.stargate);
    OFTTokenERC20(fixture.token).addMinter(address(this));
    OFTTokenERC20(fixture.token).mint(alice, amountLD);

    assertEq(OFTTokenERC20(fixture.token).balanceOf(alice), amountLD);

    vm.prank(alice);
    OFTTokenERC20(fixture.token).transfer(udAccount, amountLD);

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);
    assertEq(OFTTokenERC20(fixture.token).balanceOf(udAccount), amountLD);

    (uint256 valueToSend,,) = IUniversalDepositAccount(udAccount).quoteStargateFee(
      OFTTokenERC20(fixture.token).balanceOf(udAccount), fixture.stargate
    );
    assertGe(valueToSend, 0);

    vm.prank(caller);
    vm.expectEmit();
    emit IUniversalDepositAccount.BridgingInitiated(1);
    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(fixture.token);

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    assertGe(OFTTokenERC20(fixture.token).balanceOf(udAccount), 0);
  }

  /**
   * @notice Test emergency withdrawal of unsupported tokens
   * @dev Verifies owner-only access and unsupported token validation
   */
  function testWithdrawToken() public {
    ERC20 testERC20 = new ERC20();
    testERC20.initialize('WETH', 'WETH', 18);

    testERC20.mint(alice, 1e20);

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, poolChainId));

    vm.expectRevert();
    IUniversalDepositAccount(udAccount).settle(address(testERC20));

    vm.prank(alice);

    testERC20.transfer(udAccount, 1e18);

    vm.startPrank(caller);
    vm.expectRevert();
    IUniversalDepositAccount(udAccount).settle(address(testERC20));
    vm.expectRevert();
    IUniversalDepositAccount(udAccount).withdrawToken(address(testERC20), 1e18);
    vm.stopPrank();

    vm.prank(alice);
    IUniversalDepositAccount(udAccount).withdrawToken(address(testERC20), 1e18);
  }

  function testRevertSendingETH(
    uint256 value
  ) public {
    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, poolChainId));

    vm.prank(caller);
    vm.expectRevert();
    emit ETHNotSupported();
    udAccount.call{value: value}('');
  }

  /**
   * @notice Test not sending enough ETH to the settle function call and revert
   */
  function testRevertNotEnoughNativeFeeForSettle(
    uint64 _amountSD
  ) public {
    uint256 amountLD = Utils._sd2ld(_amountSD, conversionRate);

    vm.assume(_amountSD > 0 && amountLD < type(uint64).max);

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, oftChainId));
    (StargateFixture memory fixture) = _setupUDManager(true, assetId, poolEid);

    ERC20(fixture.token).mint(alice, amountLD);
    assertEq(ERC20(fixture.token).balanceOf(alice), amountLD);

    vm.prank(alice);
    ERC20(fixture.token).transfer(udAccount, amountLD);

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);
    assertEq(ERC20(fixture.token).balanceOf(udAccount), amountLD);
    uint256 initialUdAccountTokenBalance = ERC20(fixture.token).balanceOf(udAccount);

    (uint256 valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(ERC20(fixture.token).balanceOf(udAccount), fixture.stargate);
    assertGe(valueToSend, 0);

    vm.prank(caller);
    vm.expectRevert();
    emit InsufficientNativeToken(0, valueToSend);
    (, IUniversalDepositAccount.OFTReceipt memory oftReceipt) =
      IUniversalDepositAccount(udAccount).settle(fixture.token);

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);
    assertEq(ERC20(fixture.token).balanceOf(udAccount), initialUdAccountTokenBalance);
    assertEq(IStargatePool(fixture.stargate).poolBalance(), 0);
  }

  /**
   * @notice Test proxy initialization and metadata retrieval
   * @dev Verifies correct initialization of account parameters
   */
  function testMetadata() public {
    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, poolChainId));
    assertEq(IUniversalDepositAccount(udAccount).owner(), alice);
    assertEq(IUniversalDepositAccount(udAccount).recipient(), alice);
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);
    assertEq(IUniversalDepositAccount(udAccount).VERSION(), 1);
    assertEq(IUniversalDepositAccount(udAccount).dstChainId(), poolChainId);
  }

  function _setupUDManager(
    bool isPoolChain,
    uint16 _assetId,
    uint8 eid
  ) internal returns (StargateFixture memory fixture) {
    fixture = stargateFixtures[eid][_assetId];
    UniversalDepositManager.StargateTokenRoute memory stargateTokenRoute = UniversalDepositManager.StargateTokenRoute({
      srcStargateToken: fixture.stargate,
      dstStargateToken: makeAddr('dstStargateToken'),
      srcEid: eid,
      dstEid: isPoolChain ? oftEid : poolEid,
      tokenRoute: UniversalDepositManager.TokenRoute({
        srcToken: fixture.token,
        dstToken: makeAddr('bridged_usdc'),
        srcChainId: isPoolChain ? poolChainId : oftChainId,
        dstChainId: isPoolChain ? oftChainId : poolChainId
      })
    });

    universalDepositManager.setStargateRoute(stargateTokenRoute);
  }
}
