// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ERC20} from '../../src/test/ERC20.sol';
import {Test} from 'forge-std/Test.sol';

import {ProxyFactory} from '../../src/ProxyFactory.sol';
import {UniversalDepositAccount} from '../../src/UniversalDepositAccount.sol';
import {UniversalDepositManager} from '../../src/UniversalDepositManager.sol';

interface IOwnable {
  function owner() external returns (address);
}

/**
 * @title ProxyFactoryTest
 * @notice Unit tests for ProxyFactory contract functionality
 * @dev Tests proxy deployment, deterministic address generation, and initialization
 */
contract ProxyFactoryTest is Test {
  ProxyFactory proxyFactory;
  UniversalDepositAccount universalDepositAccountImpl;
  UniversalDepositManager universalDepositManager;

  address owner = makeAddr('owner');
  address stargateAddress = makeAddr('stargateAddress'); // src token address
  address recipient = makeAddr('recipient');
  address destinationTokenAddress = makeAddr('destinationToken');
  uint256 dstChainId = 1;
  ERC20 mockUsdc;

  event UDACreated(address indexed UD);


  function setUp() public {
    mockUsdc = new ERC20();
    universalDepositAccountImpl = new UniversalDepositAccount();
    universalDepositManager = new UniversalDepositManager();
    proxyFactory = new ProxyFactory(address(universalDepositAccountImpl), address(universalDepositManager));
  }

  /**
   * @notice Test proxy deployment and deterministic address generation
   * @dev Verifies that deployed proxy matches predicted address from getUniversalAccount
   */
  function testDeployNewProxy() public {
    address proxy = proxyFactory.createUniversalAccount(owner, recipient, dstChainId);
    address expectedProxy = proxyFactory.getUniversalAccount(owner, recipient, dstChainId);
    assertEq(proxy, expectedProxy, 'mismatch proxy address');
  }

  function testCreateAccountAndEmitEvent() public{
    address expectedProxy = proxyFactory.getUniversalAccount(owner, recipient, dstChainId);

    vm.expectEmit();
    emit UDACreated(expectedProxy);
    address proxy = proxyFactory.createUniversalAccount(owner, recipient, dstChainId);

  }
}
