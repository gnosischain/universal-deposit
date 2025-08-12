// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {UniversalDepositAccount} from './UniversalDepositAccount.sol';
import {ERC1967Proxy} from '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol';

contract ProxyFactory {
  address public immutable IMPLEMENTATION;

  constructor(
    address _implementation
  ) {
    IMPLEMENTATION = _implementation;
  }

  function createUniversalAccount(
    address _owner,
    address _recipient,
    uint256 _destinationChainId
  ) external returns (address) {
    bytes memory data = abi.encodeWithSelector(UniversalDepositAccount.initialize.selector, _owner, _recipient);
    bytes32 salt;
    assembly {
      let ptr := mload(0x40)
      mstore(ptr, _recipient)
      mstore(add(ptr, 0x20), _owner)
      mstore(add(ptr, 0x40), _destinationChainId)
      salt := keccak256(ptr, 0x60)
    }
    address proxy = address(new ERC1967Proxy{salt: salt}(IMPLEMENTATION, data));
    return proxy;
  }

  function getUniversalAccount(
    address _owner,
    address _recipient,
    uint256 _destinationChainId
  ) external view returns (address) {
    bytes memory data = abi.encodeWithSelector(UniversalDepositAccount.initialize.selector, _owner, _recipient);
    bytes32 salt;
    assembly {
      let ptr := mload(0x40)
      mstore(ptr, _recipient)
      mstore(add(ptr, 0x20), _owner)
      mstore(add(ptr, 0x40), _destinationChainId)
      salt := keccak256(ptr, 0x60)
    }

    bytes32 creationCodeHash =
      keccak256(abi.encodePacked(type(ERC1967Proxy).creationCode, abi.encode(IMPLEMENTATION, data)));

    bytes32 proxyHash = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, creationCodeHash));

    return address(uint160(uint256(proxyHash)));
  }
}
