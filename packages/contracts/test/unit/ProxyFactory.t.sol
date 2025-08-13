// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ERC20} from '../../src/test/ERC20.sol';
import {Test} from 'forge-std/Test.sol';

import {UniversalDepositAccount} from '../../src/contracts/UniversalDepositAccount.sol';
import {UniversalDepositManager} from '../../src/contracts/UniversalDepositManager.sol';
import {ProxyFactory} from 'contracts/ProxyFactory.sol';

interface IOwnable {
  function owner() external returns (address);
}

contract ProxyFactoryTest is Test {
  ProxyFactory proxyFactory;
  UniversalDepositAccount universalDepositAccountImpl;
  UniversalDepositManager universalDepositManager;

  address owner = makeAddr('owner');
  address stargateAddress = makeAddr('stargateAddress'); // src token address
  address recipient = makeAddr('recipient');
  address destinationTokenAddress = makeAddr('destinationToken');
  uint256 constant EDU_CHAINID = 41_923;
  uint32 constant EDU_EID = 30_328;
  uint256 constant GC_CHAINID = 100;
  uint32 constant GC_EID = 30_145;
  ERC20 mockUsdc;

  function setUp() public {
    mockUsdc = new ERC20();
    universalDepositAccountImpl = new UniversalDepositAccount();
    universalDepositManager = new UniversalDepositManager();
    proxyFactory = new ProxyFactory(address(universalDepositAccountImpl), address(universalDepositManager));
  }

  function testDeployNewProxy() public {
    address proxy = proxyFactory.createUniversalAccount(owner, recipient, GC_CHAINID);
    address expectedProxy = proxyFactory.getUniversalAccount(owner, recipient, GC_CHAINID);
    assertEq(proxy, expectedProxy, 'mismatch proxy address');
  }
}
