// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

// Reference:
// 1. https://github.com/stargate-protocol/stargate-v2/blob/main/packages/stg-evm-v2/test/unitest/stargate/StargatePoolUSDC.t.sol
// 2. https://github.com/stargate-protocol/stargate-v2/blob/main/packages/stg-evm-v2/test/unitest/stargate/StargateOftUSDC.t.sol

import {ProxyFactory} from '../../src/contracts/ProxyFactory.sol';
import {UniversalDepositAccount} from '../../src/contracts/UniversalDepositAccount.sol';
import {IUniversalDepositAccount} from '../../src/interfaces/IUniversalDepositAccount.sol';
import {CustomStargateTestHelper} from '../../src/test/CustomStargateTestHelper.sol';

import {ERC20} from '../../src/test/ERC20.sol';
import {IStargatePool} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/interfaces/IStargatePool.sol';
import {USDC} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/mocks/USDC.sol';
import {LPToken} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/utils/LPToken.sol';
import {OFTTokenERC20} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/utils/OFTTokenERC20.sol';
import {Test, console} from 'forge-std/Test.sol';

contract UniversalDepositTest is CustomStargateTestHelper, Test {
  LPToken public lpToken;
  address constant EDU_STARGATE_OFT_USDC = 0x2d16fde7eC929Fa00c1D373294Ae4c9Ee13F2f0e; // TODO: change
  address constant EDU_USDCE = 0xa88f8674D4Ec56c7Cf3df60924162c24a876d278; // TODO: change
  address constant GC_STARGATE_POOL_USDC = 0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3;
  address constant GC_USDCE = 0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0;

  uint256 constant EDU_CHAINID = 41_923;
  uint32 constant EDU_EID = 30_328;
  uint256 constant GC_CHAINID = 100;
  uint32 constant GC_EID = 30_145;
  uint80 public GAS_LIMIT = 50_000;

  uint80 internal constant FARE = 100_000;

  address alice = makeAddr('alice'); // alice is owner and recipient
  address caller = makeAddr('caller');
  UniversalDepositAccount universalDepositImplementation;
  ProxyFactory proxyFactory;

  function setUp() external {
    deployCodeTo('USDC.sol', abi.encode('GC_USDCE', 'USDC'), GC_USDCE);
    deployCodeTo('OFTTokenERC20.sol', abi.encode('EDU_USDCE', 'USDC'), EDU_USDCE);

    lpToken = setupStargatePoolUSDC(GC_EID, EDU_EID, GC_USDCE, GC_STARGATE_POOL_USDC);

    setupStargateOFTUSDC(EDU_EID, GC_EID, EDU_USDCE, EDU_STARGATE_OFT_USDC);

    // Add the Stargate asset as a minter so its able to be called during mint/burn

    OFTTokenERC20(EDU_USDCE).addMinter(EDU_STARGATE_OFT_USDC);
    OFTTokenERC20(EDU_USDCE).addMinter(address(this));

    universalDepositImplementation = new UniversalDepositAccount();
    proxyFactory = new ProxyFactory(address(universalDepositImplementation));

    vm.deal(alice, 1 ether);
    vm.deal(caller, 1 ether);
  }

  function testSettleOnGC() external {
    vm.chainId(GC_CHAINID);

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, 100));
    USDC(GC_USDCE).mint(alice, 1e18);
    vm.prank(alice);
    USDC(GC_USDCE).transfer(address(udAccount), 1e18);
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    // Test quoteFee - in test environment LZ fees are typically 0
    (uint256 valueToSend,, IUniversalDepositAccount.MessagingFee memory messagingFee) =
      IUniversalDepositAccount(udAccount).quoteFee(1e18);
    assertGe(valueToSend, 0);

    vm.prank(caller);
    IUniversalDepositAccount(udAccount).settle{value: 0.1 ether}();

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
  }

  function testSettleOnEdu() external {
    vm.chainId(EDU_CHAINID);
    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, 100));

    OFTTokenERC20(EDU_USDCE).mint(alice, 1e18);
    vm.prank(alice);
    OFTTokenERC20(EDU_USDCE).transfer(address(udAccount), 1e18);
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    // Test quoteFee - in test environment LZ fees are typically 0
    (uint256 valueToSend,, IUniversalDepositAccount.MessagingFee memory messagingFee) =
      IUniversalDepositAccount(udAccount).quoteFee(1e18);
    assertGe(valueToSend, 0);

    vm.prank(caller);

    IUniversalDepositAccount(udAccount).settle{value: 0.1 ether}();

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
  }

  function testWithdrawToken() public {
    vm.chainId(GC_CHAINID);
    ERC20 testERC20 = new ERC20();
    testERC20.initialize('WETH', 'WETH', 18);

    testERC20.mint(alice, 1e20);

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, 100));

    vm.expectRevert();
    IUniversalDepositAccount(udAccount).settle();

    vm.prank(alice);

    testERC20.transfer(udAccount, 1e18);

    vm.startPrank(caller);
    vm.expectRevert();
    IUniversalDepositAccount(udAccount).settle();
    vm.expectRevert();
    IUniversalDepositAccount(udAccount).withdrawToken(address(testERC20), 1e18);
    vm.stopPrank();

    vm.prank(alice);
    IUniversalDepositAccount(udAccount).withdrawToken(address(testERC20), 1e18);
  }

  function testMetadata() public {
    vm.chainId(GC_CHAINID);
    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, 100));
    assertEq(IUniversalDepositAccount(udAccount).owner(), alice);
    assertEq(IUniversalDepositAccount(udAccount).recipient(), alice);
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);
    assertEq(IUniversalDepositAccount(udAccount).VERSION(), 1);
  }
}
