// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IUniversalDepositAccount {
  struct MessagingFee {
    uint256 nativeFee;
    uint256 lzTokenFee;
  }

  struct MessagingReceipt {
    bytes32 guid;
    uint64 nonce;
    MessagingFee fee;
  }

  struct OFTReceipt {
    uint256 amountSentLD;
    uint256 amountReceivedLD;
  }

  struct SendParam {
    uint32 dstEid;
    bytes32 to;
    uint256 amountLD;
    uint256 minAmountLD;
    bytes extraOptions;
    bytes composeMsg;
    bytes oftCmd;
  }

  error AmountNotEnough(uint256 amount);
  error ETHNotSupported();
  error InsufficientNativeToken(uint256 balance, uint256 required);
  error InvalidAddress(address givernAddress);
  error InvalidToken(address token);
  error UnsupportedRoutes();

  event BridgingInitiated(uint256 indexed nonce);
  event Initialized(uint8 version);
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
  event WithdrawUnsupportedToken(address indexed token, uint256 indexed amount);

  receive() external payable;

  function VERSION() external view returns (uint8);
  function dstChainId() external view returns (uint256);
  function initialize(address _owner, address _recipient, uint256 _dstChainId, address _udManager) external;
  function nonce() external view returns (uint256);
  function owner() external view returns (address);
  function quoteStargateFee(
    uint256 amount,
    address srcStargateToken
  ) external view returns (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee);
  function recipient() external view returns (address);
  function renounceOwnership() external;
  function settle(
    address srcToken
  ) external payable returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt);
  function transferOwnership(
    address newOwner
  ) external;
  function udManager() external view returns (address);
  function withdrawToken(address token, uint256 amount) external;
}
