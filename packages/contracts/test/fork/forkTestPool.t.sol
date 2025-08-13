// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ProxyFactory} from '../../src/contracts/ProxyFactory.sol';
import {UniversalDepositAccount} from '../../src/contracts/UniversalDepositAccount.sol';

import {UniversalDepositManager} from '../../src/contracts/UniversalDepositManager.sol';

import {IUniversalDepositAccount} from '../../src/interfaces/IUniversalDepositAccount.sol';
import {IUniversalDepositManager} from '../../src/interfaces/IUniversalDepositManager.sol';
import {ERC20} from '../../src/test/ERC20.sol';
import {StargatePoolUSDC} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/usdc/StargatePoolUSDC.sol';

import {Test} from 'forge-std/Test.sol';

// USDC=0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0 \
// STARGATE_USDC=0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3 \
// DST_EID=30101 \
// DST_CHAINID=1 \
// forge test --match-contract forkTestPool --fork-url https://rpc.gnosischain.com -vvvv

contract forkTestPool is Test {
  address alice = makeAddr('alice'); // alice is owner and recipient
  address caller = makeAddr('caller');
  UniversalDepositAccount universalDepositImplementation;
  UniversalDepositManager universalDepositManager;
  ProxyFactory proxyFactory;
  ERC20 poolToken = ERC20(vm.envAddress('USDC'));
  StargatePoolUSDC stargaetPoolToken = StargatePoolUSDC(vm.envAddress('STARGATE_USDC'));
  uint32 dstEid = uint32(vm.envUint('DST_EID'));
  uint256 dstChainId = vm.envUint('DST_CHAINID');

  function setUp() public {
    universalDepositImplementation = new UniversalDepositAccount();
    universalDepositManager = new UniversalDepositManager();

    proxyFactory = new ProxyFactory(address(universalDepositImplementation), address(universalDepositManager));

    UniversalDepositManager.StargateTokenRoute memory stargateTokenRoute = UniversalDepositManager.StargateTokenRoute({
      srcStargateToken: address(stargaetPoolToken),
      dstStargateToken: makeAddr('dstStargateToken'),
      srcEid: stargaetPoolToken.localEid(),
      dstEid: dstEid,
      tokenRoute: UniversalDepositManager.TokenRoute({
        srcToken: address(poolToken),
        dstToken: makeAddr('bridged_usdc'),
        srcChainId: block.chainid,
        dstChainId: dstChainId
      })
    });
    universalDepositManager.setStargateRoute(stargateTokenRoute);
    universalDepositManager.setChainIdEid(dstChainId, dstEid);

    vm.deal(alice, 1018);
    vm.deal(caller, 10e18);
  }

  function testProxyFactory() public {
    address proxy = proxyFactory.createUniversalAccount(alice, alice, dstChainId);
    address expectedProxy = proxyFactory.getUniversalAccount(alice, alice, dstChainId);
    assertEq(proxy, expectedProxy, 'mismatch proxy address');
  }

  function testSettle() public {
    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, dstChainId));
    uint256 bridgeAmount = 1e8;
    deal(address(poolToken), alice, bridgeAmount);

    (uint256 valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(poolToken.balanceOf(alice), address(stargaetPoolToken));
    vm.prank(alice);
    poolToken.transfer(udAccount, bridgeAmount);
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(poolToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
  }

  function testWithdrawToken() public {
    ERC20 testERC20 = new ERC20();
    testERC20.initialize('WETH', 'WETH', 18);

    testERC20.mint(alice, 1e20);

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, dstChainId));

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
}