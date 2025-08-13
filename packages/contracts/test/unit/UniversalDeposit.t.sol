// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

// Reference:
// 1. https://github.com/stargate-protocol/stargate-v2/blob/main/packages/stg-evm-v2/test/unitest/stargate/StargatePoolUSDC.t.sol
// 2. https://github.com/stargate-protocol/stargate-v2/blob/main/packages/stg-evm-v2/test/unitest/stargate/StargateOftUSDC.t.sol

import {ProxyFactory} from '../../src/contracts/ProxyFactory.sol';
import {UniversalDepositAccount} from '../../src/contracts/UniversalDepositAccount.sol';

import {UniversalDepositManager} from '../../src/contracts/UniversalDepositManager.sol';

import {IUniversalDepositAccount} from '../../src/interfaces/IUniversalDepositAccount.sol';
import {IUniversalDepositManager} from '../../src/interfaces/IUniversalDepositManager.sol';
import {ERC20} from '../../src/test/ERC20.sol';

import {StargateOFT} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/StargateOFT.sol';
import {StargatePool} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/StargatePool.sol';
import {IStargatePool} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/interfaces/IStargatePool.sol';

import {PoolToken} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/mocks/PoolToken.sol';
import {USDC} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/mocks/USDC.sol';
import {LPToken} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/utils/LPToken.sol';
import {OFTTokenERC20} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/utils/OFTTokenERC20.sol';

import {StargateBase} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/StargateBase.sol';
import {
  StargateFixture,
  StargateTestHelper
} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/test/StargateTestHelper.sol';
import {Test} from 'forge-std/Test.sol';
import {IERC20} from 'forge-std/interfaces/IERC20.sol';

contract UniversalDepositTest is StargateTestHelper, Test {
  address alice = makeAddr('alice'); // alice is owner and recipient
  address caller = makeAddr('caller');
  UniversalDepositAccount universalDepositImplementation;
  UniversalDepositManager universalDepositManager;
  ProxyFactory proxyFactory;

  USDC usdc;
  OFTTokenERC20 oftUSDC;
  uint8 poolEid = 1;
  uint8 oftEid = 2;
  uint256 poolChainId = 100;
  uint256 oftChainId = 10;

  StargatePool stargatePoolUSDC;
  StargateOFT stargateOFTUSDC;

  uint8 internal NUM_ASSETS = 1; // usdc
  uint8 internal NUM_CHAINS = 2;
  uint8 internal NUM_NATIVE_POOLS = 0;
  uint8 internal NUM_OFTS = 1;
  uint8 internal NUM_POOLS = 1;

  event Fixture(StargateFixture stargateFixture);

  uint16 assetId = 1;

  function setUp() external {
    // eid = 1, 2
    // pool eid = 1
    // oft eid = 2
    // asset id = 1
    setUpStargate(NUM_ASSETS, NUM_POOLS, NUM_NATIVE_POOLS, NUM_OFTS);

    // usdc = new USDC('USDC', 'USDC');
    // oftUSDC = new OFTTokenERC20('USDC', 'USDC', 6);

    // (, stargatePoolUSDC) = setupStargatePoolUSDC(srcEid, dstEid, address(usdc));

    // (stargateOFTUSDC) = setupStargateOFTUSDC(srcEid, dstEid, address(oftUSDC));

    // // Add the Stargate asset as a minter so its able to be called during mint/burn

    universalDepositImplementation = new UniversalDepositAccount();
    universalDepositManager = new UniversalDepositManager();
    universalDepositManager.setChainIdEid(poolChainId, poolEid); // source: Pool
    universalDepositManager.setChainIdEid(oftChainId, oftEid); // dst: OFT
    assertEq(universalDepositManager.chainIdToEidMap(poolChainId), poolEid);
    assertEq(universalDepositManager.chainIdToEidMap(oftChainId), oftEid);

    proxyFactory = new ProxyFactory(address(universalDepositImplementation), address(universalDepositManager));

    vm.deal(alice, 1 ether);
    vm.deal(caller, 1 ether);
  }

  function setupUDManager(bool isPoolChain, uint16 assetId, uint8 eid) public returns (StargateFixture memory fixture) {
    fixture = stargateFixtures[eid][assetId];
    emit Fixture(fixture);

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

  function testSettleOnPoolUSDC() external {
    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, oftChainId));
    (StargateFixture memory fixture) = setupUDManager(true, assetId, poolEid);
    // StargateBase(fixture.stargate).setOFTPath(oftEid, true); // not required, will revert Path_AlreadyHasCredit() error
    emit Fixture(fixture);
    PoolToken(fixture.token).mint(alice, 1e18);
    assertEq(PoolToken(fixture.token).balanceOf(alice), 1e18);
    vm.prank(alice);
    PoolToken(fixture.token).transfer(udAccount, 1e12);
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    (uint256 valueToSend,, IUniversalDepositAccount.MessagingFee memory messagingFee) = IUniversalDepositAccount(
      udAccount
    ).quoteStargateFee(PoolToken(fixture.token).balanceOf(udAccount), fixture.stargate);
    assertGe(valueToSend, 0);

    vm.prank(caller);
    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(fixture.token);

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
  }

  function testSettleOnOFTUSDC() external {
    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, poolChainId));
    (StargateFixture memory fixture) = setupUDManager(false, assetId, oftEid);
    StargateBase(fixture.stargate).setOFTPath(poolEid, true);
    emit Fixture(fixture);
    OFTTokenERC20(fixture.token).addMinter(fixture.stargate);
    OFTTokenERC20(fixture.token).addMinter(address(this));
    OFTTokenERC20(fixture.token).mint(alice, 1e18);
    assertEq(OFTTokenERC20(fixture.token).balanceOf(alice), 1e18);
    vm.prank(alice);
    OFTTokenERC20(fixture.token).transfer(udAccount, 1e12);
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    (uint256 valueToSend,, IUniversalDepositAccount.MessagingFee memory messagingFee) = IUniversalDepositAccount(
      udAccount
    ).quoteStargateFee(OFTTokenERC20(fixture.token).balanceOf(udAccount), fixture.stargate);
    assertGe(valueToSend, 0);

    vm.prank(caller);
    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(fixture.token);

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
  }

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

  function testMetadata() public {
    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, poolChainId));
    assertEq(IUniversalDepositAccount(udAccount).owner(), alice);
    assertEq(IUniversalDepositAccount(udAccount).recipient(), alice);
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);
    assertEq(IUniversalDepositAccount(udAccount).VERSION(), 1);
    assertEq(IUniversalDepositAccount(udAccount).dstChainId(), poolChainId);
  }
}
