// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ProxyFactory} from '../../src/ProxyFactory.sol';

import {UniversalDepositAccount} from '../../src/UniversalDepositAccount.sol';
import {UniversalDepositManager} from '../../src/UniversalDepositManager.sol';
import {IUniversalDepositAccount} from '../../src/interfaces/IUniversalDepositAccount.sol';
import {IUniversalDepositManager} from '../../src/interfaces/IUniversalDepositManager.sol';
import {ERC20} from '../../src/test/ERC20.sol';
import {
  MessagingFee,
  MessagingReceipt,
  OFTFeeDetail,
  OFTLimit,
  OFTReceipt,
  SendParam
} from '@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol';

import {
  Credit,
  TargetCredit
} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/interfaces/ICreditMessagingHandler.sol';
import {StargateOFTUSDC} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/usdc/StargateOFTUSDC.sol';

import {Utils} from '../../src/utils/Utils.sol';
import {Test} from 'forge-std/Test.sol';
import {console} from 'forge-std/console.sol';

/**
 * @title forkTestOFTChain
 * @notice Fork tests for UniversalDepositAccount using real Stargate V2 contracts on Rari Chain
 * @dev Tests bridging USDC from Rari Chain to Gnosis Chain using live contract addresses
 *
 * Test command: (Source Chain: Rari, Destination Chain: Gnosis)
 * USDC=0xFbDa5F676cB37624f28265A144A48B0d6e87d3b6 \
 * STARGATE_USDC=0x875bee36739e7Ce6b60E056451c556a88c59b086 \
 * DST_EID=30145(Gnosis) or 30290 (Taiko) \
 * DST_CHAINID=100(Gnosis) or 167009 (Taiko) \
 * IS_TO_OFT_CHAIN=false or true \
 * forge test --match-contract forkTestOFTChain --fork-url https://mainnet.rpc.rarichain.org/http -vvvv
 */
contract forkTestOFTChain is Test {
  address alice = makeAddr('alice'); // alice is owner and recipient
  address caller = makeAddr('caller');
  UniversalDepositAccount universalDepositImplementation;
  UniversalDepositManager universalDepositManager;
  ProxyFactory proxyFactory;
  ERC20 oftToken = ERC20(vm.envAddress('USDC'));
  StargateOFTUSDC stargateOftToken = StargateOFTUSDC(vm.envAddress('STARGATE_USDC'));
  uint32 dstEid = uint32(vm.envUint('DST_EID'));
  uint256 dstChainId = vm.envUint('DST_CHAINID');
  uint256 stargateConversionRate = Utils._getStargateConversionRate(oftToken.decimals());

  function setUp() public {
    universalDepositImplementation = new UniversalDepositAccount();
    universalDepositManager = new UniversalDepositManager();

    proxyFactory = new ProxyFactory(address(universalDepositImplementation), address(universalDepositManager));

    UniversalDepositManager.StargateTokenRoute memory stargateTokenRoute = UniversalDepositManager.StargateTokenRoute({
      srcStargateToken: address(stargateOftToken),
      dstStargateToken: makeAddr('dstStargateToken'),
      srcEid: stargateOftToken.localEid(),
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

  /**
   * @notice Test proxy factory deterministic address generation
   * @dev Verifies CREATE2 address computation matches deployment
   */
  function testProxyFactory() public {
    address proxy = proxyFactory.createUniversalAccount(alice, alice, dstChainId);
    address expectedProxy = proxyFactory.getUniversalAccount(alice, alice, dstChainId);
    assertEq(proxy, expectedProxy, 'mismatch proxy address');
  }

  function testSettleToPoolChain(
    uint64 _amountSD
  ) public {
    vm.skip(vm.envBool('IS_TO_OFT_CHAIN'));
    uint64 originalCredit = stargateOftToken.paths(dstEid);
    uint256 amountLD = Utils._sd2ld(_amountSD, stargateConversionRate);
    amountLD = bound(amountLD, 1e4, originalCredit);

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, dstChainId));

    deal(address(oftToken), alice, amountLD);
    vm.prank(alice);
    oftToken.transfer(udAccount, amountLD);

    (uint256 valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(oftToken.balanceOf(udAccount), address(stargateOftToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(oftToken));
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    assertEq(oftToken.balanceOf(udAccount), 0);
  }

  // Test when the bridge amount is larger than credit, then have to initiate a second time when there is enough credit
  function testSettleToPoolChainWithoutEnoughStargateCredit(
    uint64 _amountSD
  ) public {
    vm.skip(vm.envBool('IS_TO_OFT_CHAIN'));
    vm.assume(_amountSD > 0);
    uint64 originalCredit = stargateOftToken.paths(dstEid);
    uint256 amountLD = Utils._sd2ld(_amountSD, stargateConversionRate);
    amountLD = bound(amountLD, originalCredit + 1, originalCredit * 15 / 10);

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, dstChainId));

    deal(address(oftToken), alice, amountLD);
    vm.prank(alice);
    oftToken.transfer(udAccount, amountLD);

    uint256 initialAccountBalance = oftToken.balanceOf(udAccount);

    (uint256 valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(initialAccountBalance, address(stargateOftToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(oftToken));
    // Verify first settle partially succeeded
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    uint256 remainingBalance = oftToken.balanceOf(udAccount);
    assertTrue(remainingBalance > 0, 'Should have remaining balance after partial settle');

    vm.prank(stargateOftToken.getAddressConfig().creditMessaging);
    Credit[] memory credits = new Credit[](1);
    credits[0] = Credit({srcEid: dstEid, amount: originalCredit}); // Add enough credit for remaining amount
    stargateOftToken.receiveCredits(dstEid, credits);

    (uint256 valueToSend2nd,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(initialAccountBalance, address(stargateOftToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    IUniversalDepositAccount(udAccount).settle{value: valueToSend2nd}(address(oftToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 2);
    assertEq(oftToken.balanceOf(udAccount), 0, 'Should bridge all oft token on ud account');
  }

  //  replace DST_CHAINID & DST_EID to a Hydra OFT chain
  function testSettleToOFTChain(
    uint64 _amountSD
  ) public {
    vm.skip(!vm.envBool('IS_TO_OFT_CHAIN'));

    uint64 originalCredit = stargateOftToken.paths(dstEid);

    require(
      originalCredit == type(uint64).max && originalCredit > oftToken.totalSupply(), 'Should have unlimited credit'
    );
    uint256 amountLD = Utils._sd2ld(_amountSD, stargateConversionRate);

    amountLD = bound(amountLD, 1e4, oftToken.totalSupply()); // put 1e4 to avoid Stargate_SlippageTooHigh();

    address payable udAccount = payable(proxyFactory.createUniversalAccount(alice, alice, dstChainId));

    deal(address(oftToken), alice, amountLD);

    vm.prank(alice);
    oftToken.transfer(udAccount, amountLD);

    uint256 initialAccountBalance = oftToken.balanceOf(udAccount);

    (uint256 valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(initialAccountBalance, address(stargateOftToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 0);

    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(oftToken));
    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    assertEq(oftToken.balanceOf(udAccount), 0);

    (valueToSend,,) =
      IUniversalDepositAccount(udAccount).quoteStargateFee(initialAccountBalance, address(stargateOftToken));

    assertEq(IUniversalDepositAccount(udAccount).nonce(), 1);
    vm.expectRevert();
    IUniversalDepositAccount(udAccount).settle{value: valueToSend}(address(oftToken));
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
