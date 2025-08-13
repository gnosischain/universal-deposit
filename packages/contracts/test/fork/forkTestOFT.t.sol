// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ProxyFactory} from '../../src/contracts/ProxyFactory.sol';
import {UniversalDepositAccount} from '../../src/contracts/UniversalDepositAccount.sol';
import {UniversalDepositManager} from '../../src/contracts/UniversalDepositManager.sol';
import {IUniversalDepositAccount} from '../../src/interfaces/IUniversalDepositAccount.sol';
import {IUniversalDepositManager} from '../../src/interfaces/IUniversalDepositManager.sol';
import {ERC20} from '../../src/test/ERC20.sol';
import {StargateOFTUSDC} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/usdc/StargateOFTUSDC.sol';

import {Test} from 'forge-std/Test.sol';

// USDC=0xFbDa5F676cB37624f28265A144A48B0d6e87d3b6 \
// STARGATE_USDC=0x875bee36739e7Ce6b60E056451c556a88c59b086 \
// DST_EID=30145 \
// DST_CHAINID=100 \
// forge test --match-contract forkTestOFT --fork-url https://mainnet.rpc.rarichain.org/http -vvvv

contract forkTestOFT is Test {
  address alice = makeAddr('alice'); // alice is owner and recipient
  address caller = makeAddr('caller');
  UniversalDepositAccount universalDepositImplementation;
  UniversalDepositManager universalDepositManager;
  ProxyFactory proxyFactory;
  ERC20 oftToken = ERC20(vm.envAddress('USDC'));
  StargateOFTUSDC stargaetoftToken = StargateOFTUSDC(vm.envAddress('STARGATE_USDC'));
  uint32 dstEid = uint32(vm.envUint('DST_EID'));
  uint256 dstChainId = vm.envUint('DST_CHAINID');

  function setUp() public {
    universalDepositImplementation = new UniversalDepositAccount();
    universalDepositManager = new UniversalDepositManager();

    proxyFactory = new ProxyFactory(address(universalDepositImplementation), address(universalDepositManager));

    UniversalDepositManager.StargateTokenRoute memory stargateTokenRoute = UniversalDepositManager.StargateTokenRoute({
      srcStargateToken: address(stargaetoftToken),
      dstStargateToken: makeAddr('dstStargateToken'),
      srcEid: stargaetoftToken.localEid(),
      dstEid: dstEid,
      tokenRoute: UniversalDepositManager.TokenRoute({
        srcToken: address(oftToken),
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
    deal(address(oftToken), alice, bridgeAmount);

    (uint256 valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(oftToken.balanceOf(alice), address(stargaetoftToken));
    vm.prank(alice);
    oftToken.transfer(udAccount, bridgeAmount);
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(oftToken));

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