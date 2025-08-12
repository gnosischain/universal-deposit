// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {MockERC20} from 'forge-std/mocks/MockERC20.sol';

contract ERC20 is MockERC20 {
  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external {
    _burn(from, amount);
  }
}
