// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script} from 'forge-std/Script.sol';
import {ProxyFactory} from '../src/ProxyFactory.sol';
import {UniversalDepositAccount} from '../src/UniversalDepositAccount.sol';
import {UniversalDepositManager} from '../src/UniversalDepositManager.sol';


contract DeployScript is Script {
  function run() external {
    uint256 deployerPrivateKey = vm.envUint('PRIVATE_KEY');
    vm.startBroadcast(deployerPrivateKey);

    UniversalDepositAccount universalDepositAccountImpl = new UniversalDepositAccount();
    UniversalDepositManager universalDepositManager = new UniversalDepositManager();
    ProxyFactory proxyFactory = new ProxyFactory(address(universalDepositAccountImpl), address(universalDepositManager));
    vm.stopBroadcast();
  }
}
