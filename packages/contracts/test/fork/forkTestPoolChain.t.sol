// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ProxyFactory} from '../../src/ProxyFactory.sol';
import {UniversalDepositAccount} from '../../src/UniversalDepositAccount.sol';

import {UniversalDepositManager} from '../../src/UniversalDepositManager.sol';

import {IUniversalDepositAccount} from '../../src/interfaces/IUniversalDepositAccount.sol';
import {IUniversalDepositManager} from '../../src/interfaces/IUniversalDepositManager.sol';
import {ERC20} from '../../src/test/ERC20.sol';

import {StargateBase} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/StargateBase.sol';
import {
  Credit,
  TargetCredit
} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/interfaces/ICreditMessagingHandler.sol';
import {StargatePoolUSDC} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/usdc/StargatePoolUSDC.sol';

import {console} from 'forge-std/console.sol';

import {Test} from 'forge-std/Test.sol';

import {Utils} from '../../src/utils/Utils.sol';

/**
 * @title forkTestPoolChain
 * @notice Fork tests for UniversalDepositAccount using real Stargate V2 Pool contracts on Gnosis Chain
 * @dev Tests bridging USDC from Gnosis Chain to Ethereum using live pool addresses
 *
 * Test command: (Source Chain: Gnosis, Destination Chain: Ethereum)
 * USDC=0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0 \
 * STARGATE_USDC=0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3 \
 * DST_EID=30101 (ETH) or 30235(Rari) \
 * DST_CHAINID=1 (ETH) or 1380012617 (Rari) \
 * IS_TO_OFT_CHAIN=false or true \
 * forge test --match-contract forkTestPool --fork-url https://rpc.gnosischain.com -vvvv
 */
contract forkTestPoolChain is Test {
  address alice = makeAddr('alice'); // alice is owner and recipient
  address caller = makeAddr('caller');
  UniversalDepositAccount universalDepositImplementation;
  UniversalDepositManager universalDepositManager;
  ProxyFactory proxyFactory;
  ERC20 poolToken = ERC20(vm.envAddress('USDC'));
  StargatePoolUSDC stargatePoolToken = StargatePoolUSDC(vm.envAddress('STARGATE_USDC'));
  uint32 dstEid = uint32(vm.envUint('DST_EID'));
  uint256 dstChainId = vm.envUint('DST_CHAINID');
  uint256 stargateConversionRate = Utils._getStargateConversionRate(poolToken.decimals());

  event BalanceIsZero();
  event CurrentCredit(uint64 credit);

  function setUp() public {
    universalDepositImplementation = new UniversalDepositAccount();
    universalDepositManager = new UniversalDepositManager();

    proxyFactory = new ProxyFactory(address(universalDepositImplementation), address(universalDepositManager));

    UniversalDepositManager.StargateTokenRoute memory stargateTokenRoute = UniversalDepositManager.StargateTokenRoute({
      srcStargateToken: address(stargatePoolToken),
      dstStargateToken: makeAddr('dstStargateToken'),
      srcEid: stargatePoolToken.localEid(),
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

  /**
   * @notice Test proxy factory deterministic address generation
   * @dev Verifies CREATE2 address computation matches deployment
   */
  function testProxyFactory() public {
    address proxy = proxyFactory.createUniversalAccount(alice, alice, dstChainId);
    address expectedProxy = proxyFactory.getUniversalAccount(alice, alice, dstChainId);
    assertEq(proxy, expectedProxy, 'mismatch proxy address');
  }

  function testSettleToPoolChainWithoutEnoughStargateCredit(
    uint64 _amountSD
  ) public {
    vm.skip(vm.envBool('IS_TO_OFT_CHAIN'));

    uint64 originalCredit = stargatePoolToken.paths(dstEid);

    require(originalCredit < type(uint64).max, 'Destination chain is not a Pool chain');

    vm.assume(_amountSD > 0 && poolToken.totalSupply() > originalCredit);

    uint256 amountLD = Utils._sd2ld(_amountSD, stargateConversionRate);
    amountLD = bound(amountLD, originalCredit + 1, originalCredit * 15 / 10); // make sure the amount can be fully bridged for the 2nd time
    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, dstChainId));
    deal(address(poolToken), alice, amountLD);

    vm.prank(alice);
    poolToken.transfer(udAccount, amountLD);
    uint256 initialStargatePoolBalance = ERC20(poolToken).balanceOf(address(stargatePoolToken));
    uint256 initialAccountBalance = poolToken.balanceOf(udAccount);
    (uint256 valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(poolToken.balanceOf(udAccount), address(stargatePoolToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);
    vm.prank(caller);
    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(poolToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    assertLe(ERC20(poolToken).balanceOf(address(stargatePoolToken)), initialStargatePoolBalance + amountLD); // Eq initialStargatePoolBalance + amountLD - protocol fee
    assertEq(ERC20(stargatePoolToken.lpToken()).balanceOf(udAccount), 0);
    assertGt(ERC20(poolToken).balanceOf(udAccount), 0);
    assertGt(initialAccountBalance, ERC20(poolToken).balanceOf(udAccount));

    vm.prank(stargatePoolToken.getAddressConfig().creditMessaging);
    Credit[] memory credits = new Credit[](1);
    credits[0] = Credit({srcEid: dstEid, amount: originalCredit}); // Add enough credit for remaining amount
    stargatePoolToken.receiveCredits(dstEid, credits);

    (valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(poolToken.balanceOf(udAccount), address(stargatePoolToken));

    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(poolToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 2);

    assertEq(poolToken.balanceOf(udAccount), 0, 'Should bridge all pool token on ud account');

    vm.prank(caller);
    vm.expectRevert();
    emit BalanceIsZero();
    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(poolToken));
  }

  function testSettleToPoolChain(
    uint64 _amountSD
  ) public {
    vm.skip(vm.envBool('IS_TO_OFT_CHAIN'));

    uint64 originalCredit = stargatePoolToken.paths(dstEid);
    require(originalCredit < type(uint64).max, 'Destination chain is not a Pool chain');
    vm.assume(_amountSD > 0 && poolToken.totalSupply() > originalCredit);

    uint256 amountLD = Utils._sd2ld(_amountSD, stargateConversionRate);
    amountLD = bound(amountLD, 1e4, originalCredit);
    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, dstChainId));
    deal(address(poolToken), alice, amountLD);

    vm.prank(alice);
    poolToken.transfer(udAccount, amountLD);

    uint256 initialStargatePoolBalance = ERC20(poolToken).balanceOf(address(stargatePoolToken));

    (uint256 valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(poolToken.balanceOf(udAccount), address(stargatePoolToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(poolToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    assertEq(ERC20(poolToken).balanceOf(address(stargatePoolToken)), initialStargatePoolBalance + amountLD);
    assertEq(ERC20(stargatePoolToken.lpToken()).balanceOf(udAccount), 0);
    assertEq(ERC20(poolToken).balanceOf(udAccount), 0);
  }

  /**
   * @notice Test live settlement on forked Gnosis Chain
   * @dev Tests real USDC bridging via Stargate Pool to Hydra OFT chain
   */
  function testSettleToOFTChain(
    uint64 _amountSD
  ) public {
    vm.skip(!vm.envBool('IS_TO_OFT_CHAIN'));

    uint64 originalCredit = stargatePoolToken.paths(dstEid);

    require(originalCredit == type(uint64).max, 'Should have unlimited credit');

    uint256 amountLD = Utils._sd2ld(_amountSD, stargateConversionRate);
    amountLD = bound(amountLD, 1, poolToken.totalSupply());

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, dstChainId));

    deal(address(poolToken), alice, amountLD);
    vm.prank(alice);
    poolToken.transfer(udAccount, amountLD);

    uint256 initialAccountBalance = poolToken.balanceOf(udAccount);

    (uint256 valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(initialAccountBalance, address(stargatePoolToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(poolToken));
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    assertEq(poolToken.balanceOf(udAccount), 0);

    (valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(initialAccountBalance, address(stargatePoolToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    vm.expectRevert();
    emit BalanceIsZero();
    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(poolToken));
  }

  /**
   * @notice Test emergency withdrawal on forked chain
   * @dev Verifies unsupported token withdrawal functionality
   */
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
