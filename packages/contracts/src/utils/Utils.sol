// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

library Utils {
  function _getStargateConversionRate(
    uint8 _tokenDecimals
  ) internal pure returns (uint256) {
    return 10 ** (_tokenDecimals - 6);
  }

  function _sd2ld(uint64 _amountSD, uint256 _conversionRate) internal pure returns (uint256) {
    return uint256(_amountSD) * _conversionRate;
  }

  function _ld2sd(uint256 _amountLD, uint256 _conversionRate) internal pure returns (uint64) {
    return uint64(_amountLD / _conversionRate);
  }

  function _addressToBytes32(
    address _addr
  ) internal pure returns (bytes32) {
    return bytes32(uint256(uint160(_addr)));
  }
}
