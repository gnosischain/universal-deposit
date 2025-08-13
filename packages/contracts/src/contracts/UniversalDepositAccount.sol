// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {IUniversalDepositManager} from '../interfaces/IUniversalDepositManager.sol';
import {
  MessagingFee,
  MessagingReceipt,
  OFTReceipt,
  SendParam
} from '@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol';
import {OwnableUpgradeable} from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {IStargate} from '@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol';
import {IERC20} from 'forge-std/interfaces/IERC20.sol';

// This contract facilitates the bridging of USDC between EDU Chain and Gnosis Chain with Stargate
// It is deployed per destination chain
contract UniversalDepositAccount is Initializable, OwnableUpgradeable {
  uint8 public constant VERSION = 1;

  IUniversalDepositManager public udManager;

  uint256 public dstChainId;

  address public recipient;
  uint256 public nonce;

  event BridgingInitiated(uint256 indexed nonce);
  event WithdrawUnsupportedToken(address indexed token, uint256 indexed amount);

  error UnsupportedRoutes();
  error InvalidAddress(address givernAddress);
  error AmountNotEnough(uint256 amount);
  error InvalidToken(address token);
  error InsufficientNativeToken(uint256 balance, uint256 required);
  error ETHNotSupported();

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(address _owner, address _recipient, uint256 _dstChainId, address _udManager) external initializer {
    if (_owner == address(0)) revert InvalidAddress(_owner);
    if (_recipient == address(0)) revert InvalidAddress(_recipient);

    __Ownable_init();
    transferOwnership(_owner);
    recipient = _recipient;
    dstChainId = _dstChainId;

    udManager = IUniversalDepositManager(_udManager);
  }

  function quoteStargateFee(
    uint256 amount,
    address srcStargateToken
  ) public view returns (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) {
    if (amount == 0) revert AmountNotEnough(amount);
    sendParam = SendParam({
      dstEid: udManager.chainIdToEidMap(dstChainId), //
      to: addressToBytes32(recipient),
      amountLD: amount,
      minAmountLD: amount, // Will be updated with quote
      extraOptions: new bytes(0), // Default, can be customized
      composeMsg: new bytes(0), // Default, can be customized
      oftCmd: '' // Empty for taxi mode
    });

    // Get accurate minimum amount from quote
    (,, OFTReceipt memory receipt) = IStargate(srcStargateToken).quoteOFT(sendParam);
    // Use 95% of amount as minimum to allow for small slippage
    // sendParam.minAmountLD = receipt.amountReceivedLD > 0 ? receipt.amountReceivedLD : (amount * 95) / 100;

    sendParam.minAmountLD = receipt.amountReceivedLD;

    // Get messaging fee
    messagingFee = IStargate(srcStargateToken).quoteSend(sendParam, false); // false for not paying with ZRO
    valueToSend = messagingFee.nativeFee;

    // If sending native gas token, add amount to valueToSend
    if (IStargate(srcStargateToken).token() == address(0x0)) {
      valueToSend += sendParam.amountLD;
    }
  }

  function addressToBytes32(
    address _addr
  ) internal pure returns (bytes32) {
    return bytes32(uint256(uint160(_addr)));
  }

  ///@dev ETH is not supported
  receive() external payable {
    revert ETHNotSupported();
  }

  function withdrawToken(address token, uint256 amount) external onlyOwner {
    if (udManager.isTokenSupported(token) || token == address(0)) revert InvalidToken(token);
    if (amount == 0) revert AmountNotEnough(amount);
    IERC20(token).transfer(owner(), amount);

    emit WithdrawUnsupportedToken(token, amount);
  }

  function settle(
    address srcToken
  ) public payable returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt) {
    IUniversalDepositManager.StargateTokenRoute memory stargateTokenRoute = udManager.getStargateRoute(srcToken);

    uint256 bridgeAmount = IERC20(srcToken).balanceOf(address(this));

    IERC20(srcToken).approve(stargateTokenRoute.srcStargateToken, bridgeAmount);
    (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) =
      quoteStargateFee(bridgeAmount, stargateTokenRoute.srcStargateToken);
    if (address(this).balance < valueToSend) revert InsufficientNativeToken(address(this).balance, valueToSend);

    (msgReceipt, oftReceipt,) =
      IStargate(stargateTokenRoute.srcStargateToken).sendToken{value: valueToSend}(sendParam, messagingFee, owner()); // Use owner as refundAddress
    nonce += 1;
    emit BridgingInitiated(nonce);
  }
}
