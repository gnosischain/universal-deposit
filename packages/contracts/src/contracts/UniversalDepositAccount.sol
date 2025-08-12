// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

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
contract UniversalDepositAccount is Initializable, OwnableUpgradeable {
  uint8 public constant VERSION = 1;
  address public constant EDU_STARGATE_OFT_USDC = 0x2d16fde7eC929Fa00c1D373294Ae4c9Ee13F2f0e; // TODO: change
  address public constant EDU_USDCE = 0xa88f8674D4Ec56c7Cf3df60924162c24a876d278; // TODO: change
  address public constant GC_STARGATE_POOL_USDC = 0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3;
  address public constant GC_USDCE = 0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0;
  uint256 public constant EDU_CHAINID = 41_923;
  uint32 public constant EDU_EID = 30_328;
  uint256 public constant GC_CHAINID = 100;
  uint32 public constant GC_EID = 30_145;

  uint32 public dstEid;
  address public srcUsdce;
  address public srcStargateUsdc;

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

  function initialize(address _owner, address _recipient) external initializer {
    if (_owner == address(0)) revert InvalidAddress(_owner);
    if (_recipient == address(0)) revert InvalidAddress(_recipient);
    if (block.chainid == EDU_CHAINID) {
      dstEid = GC_EID;
      srcUsdce = EDU_USDCE;
      srcStargateUsdc = EDU_STARGATE_OFT_USDC;
    } else if (block.chainid == GC_CHAINID) {
      dstEid = EDU_EID;
      srcUsdce = GC_USDCE;
      srcStargateUsdc = GC_STARGATE_POOL_USDC;
    } else {
      revert UnsupportedRoutes();
    }

    __Ownable_init();
    transferOwnership(_owner);
    recipient = _recipient;
  }

  // USDC.e.trasfer(address(this)) -> approve StargateUSDC -> StargateUSDC.send -> bridge
  function settle() external payable returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt) {
    uint256 bridgeAmount = IERC20(srcUsdce).balanceOf(address(this));

    IERC20(srcUsdce).approve(srcStargateUsdc, bridgeAmount);
    (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) = quoteFee(bridgeAmount);
    if(address(this).balance < valueToSend) revert InsufficientNativeToken(address(this).balance, valueToSend);

    (msgReceipt, oftReceipt,) =
      IStargate(srcStargateUsdc).sendToken{value: valueToSend}(sendParam, messagingFee, owner()); // Use owner as refundAddress
    nonce += 1;
    emit BridgingInitiated(nonce);
  }

  function quoteFee(
    uint256 amount
  ) public view returns (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) {
    if (amount == 0) revert AmountNotEnough(amount);
    sendParam = SendParam({
      dstEid: dstEid, //
      to: addressToBytes32(recipient),
      amountLD: amount,
      minAmountLD: amount, // Will be updated with quote
      extraOptions: new bytes(0), // Default, can be customized
      composeMsg: new bytes(0), // Default, can be customized
      oftCmd: '' // Empty for taxi mode
    });

    // Get accurate minimum amount from quote
    (,, OFTReceipt memory receipt) = IStargate(srcStargateUsdc).quoteOFT(sendParam);
    // Use 95% of amount as minimum to allow for small slippage
    // sendParam.minAmountLD = receipt.amountReceivedLD > 0 ? receipt.amountReceivedLD : (amount * 95) / 100;

    sendParam.minAmountLD = receipt.amountReceivedLD;

    // Get messaging fee
    messagingFee = IStargate(srcStargateUsdc).quoteSend(sendParam, false); // false for not paying with ZRO
    valueToSend = messagingFee.nativeFee;

    // If sending native gas token, add amount to valueToSend
    if (IStargate(srcStargateUsdc).token() == address(0x0)) {
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
    if (token == srcUsdce || token == address(0)) revert InvalidToken(token);
    if (amount == 0) revert AmountNotEnough(amount);
    IERC20(token).transfer(owner(), amount);

    emit WithdrawUnsupportedToken(token, amount);
  }
}
