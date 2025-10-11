// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {IUniversalDepositManager} from './interfaces/IUniversalDepositManager.sol';
import {Utils} from './utils/Utils.sol';
import {
  MessagingFee,
  MessagingReceipt,
  OFTReceipt,
  SendParam
} from '@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol';
import {OwnableUpgradeable} from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {StargateBase} from '@stargatefinance/stg-evm-v2/src/StargateBase.sol';
import {IStargate} from '@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol';
import {IERC20} from 'forge-std/interfaces/IERC20.sol';

/**
 * @title UniversalDepositAccount
 * @author gnosis
 * @notice User-controlled proxy contract for cross-chain token deposits
 * @dev This contract is deployed as an upgradeable proxy per user per destination chain.
 *      It facilitates automated bridging of deposited tokens to a specified recipient address.
 *      Each account is owned by the user who created it and can bridge tokens to one destination chain.
 */
contract UniversalDepositAccount is Initializable, OwnableUpgradeable {
  /// @notice Contract version for upgrade compatibility
  uint8 public constant VERSION = 1;

  /// @notice Reference to the UniversalDepositManager for routing configurations
  IUniversalDepositManager public udManager;

  /// @notice The destination chain ID where tokens will be bridged
  uint256 public dstChainId;

  /// @notice The address that will receive tokens on the destination chain
  address public recipient;

  /// @notice Incremental counter for bridge operations
  uint256 public nonce;

  /**
   * @notice Emitted when a bridge operation is initiated
   * @param nonce The operation counter at the time of bridging
   */
  event BridgingInitiated(uint256 indexed nonce);

  /**
   * @notice Emitted when unsupported tokens are withdrawn by the owner
   * @param token The token address that was withdrawn
   * @param amount The amount that was withdrawn
   */
  event WithdrawUnsupportedToken(address indexed token, uint256 indexed amount);

  /// @notice Thrown when an invalid address (zero address) is provided
  /// @param givenAddress The invalid address that was provided
  error InvalidAddress(address givenAddress);

  /// @notice Thrown when an operation involves zero or insufficient amount
  /// @param amount The insufficient amount provided
  error AmountNotEnough(uint256 amount);

  /// @notice Thrown when attempting to withdraw a supported token or zero address
  /// @param token The invalid token address
  error InvalidToken(address token);

  /// @notice Thrown when insufficient native tokens are available for bridge fees
  /// @param balance The current native token balance
  /// @param required The required native token amount
  error InsufficientNativeToken(uint256 balance, uint256 required);

  /// @notice Thrown when the slipppage is too high from the minimum expected received amount
  /// @param minAmount minimum amount that should expect to receive
  /// @param actualReceivedAmount actual amount that should receive
  error SlippageToHigh(uint256 minAmount, uint256 actualReceivedAmount);

  /// @notice Thrown when ETH is sent to the contract (not supported)
  error ETHNotSupported();

  /**
   * @notice Constructor that disables initializers to prevent direct implementation usage
   * @dev Required for upgradeable proxy pattern security
   */
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice Initializes the proxy instance with user-specific configuration
   * @dev Can only be called once per proxy. Sets up ownership and routing parameters.
   * @param _owner The address that will own this deposit account
   * @param _recipient The address that will receive bridged tokens on the destination chain
   * @param _dstChainId The destination chain ID for token bridging
   * @param _udManager The UniversalDepositManager contract address for routing info
   */
  function initialize(address _owner, address _recipient, uint256 _dstChainId, address _udManager) external initializer {
    if (_owner == address(0)) revert InvalidAddress(_owner);
    if (_recipient == address(0)) revert InvalidAddress(_recipient);

    __Ownable_init();
    transferOwnership(_owner);
    recipient = _recipient;
    dstChainId = _dstChainId;

    udManager = IUniversalDepositManager(_udManager);
  }

  /**
   * @notice Calculates the required native token amount and parameters for Stargate bridging
   * @dev Queries Stargate for accurate fee estimation and minimum amount calculations
   * @param amount The amount of tokens to bridge
   * @param srcStargateToken The Stargate pool/OFT address for the source token
   * @param maxSlippage max slippage allowed, 10000 = 100%
   * @return valueToSend The total native token amount needed
   * @return sendParam The complete SendParam struct for the Stargate transaction
   * @return messagingFee The LayerZero messaging fee breakdown
   */
  function quoteStargateFee(
    uint256 amount,
    address srcStargateToken,
    uint256 maxSlippage
  ) public view returns (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) {
    if (amount == 0) revert AmountNotEnough(amount);

    sendParam = SendParam({
      dstEid: udManager.chainIdToEidMap(dstChainId),
      to: Utils._addressToBytes32(recipient),
      amountLD: amount,
      minAmountLD: amount, // Will be updated with quote
      extraOptions: new bytes(0), // Default, can be customized
      composeMsg: new bytes(0), // Default, can be customized
      oftCmd: '' // Empty for taxi mode
    });

    // Get accurate minimum amount from quote
    (,, OFTReceipt memory receipt) = IStargate(srcStargateToken).quoteOFT(sendParam);
    uint256 minReceivedAmount = (receipt.amountReceivedLD * (10_000 - maxSlippage)) / 10_000;
    if (receipt.amountReceivedLD < minReceivedAmount) {
      revert SlippageToHigh(minReceivedAmount, receipt.amountReceivedLD);
    }
    sendParam.minAmountLD = receipt.amountReceivedLD;

    // Get messaging fee
    messagingFee = IStargate(srcStargateToken).quoteSend(sendParam, false); // false for not paying with ZRO
    valueToSend = messagingFee.nativeFee;

    // If sending native gas token, add amount to valueToSend
    if (IStargate(srcStargateToken).token() == address(0x0)) {
      valueToSend += sendParam.amountLD;
    }
  }

  /**
   * @notice Rejects direct ETH transfers to the contract
   * @dev ETH bridging is not supported in this implementation
   */
  receive() external payable {
    revert ETHNotSupported();
  }

  /**
   * @notice Emergency withdrawal function for unsupported tokens
   * @dev Only callable by the account owner. Cannot withdraw supported bridging tokens.
   * @param token The token address to withdraw (must not be supported for bridging)
   * @param amount The amount to withdraw (must be greater than 0)
   */
  function withdrawToken(address token, uint256 amount) external onlyOwner {
    if (udManager.isSrcTokenSupported(token) || token == address(0)) revert InvalidToken(token);
    if (amount == 0) revert AmountNotEnough(amount);
    IERC20(token).transfer(owner(), amount);

    emit WithdrawUnsupportedToken(token, amount);
  }

  /**
   * @notice Initiates cross-chain bridging of the entire token balance via Stargate
   * @dev Can be called by anyone who provides sufficient native tokens for fees.
   *      Automatically bridges the full balance of the specified token to the configured recipient.
   * @param srcToken The source token address to bridge
   * @param maxSlippage max slippage allowed, 10000 = 100%
   * @return msgReceipt LayerZero messaging receipt with transaction details
   * @return oftReceipt OFT receipt with amount and fee information
   */
  function settle(
    address srcToken,
    uint256 maxSlippage
  ) public payable returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt) {
    IUniversalDepositManager.StargateTokenRoute memory stargateTokenRoute =
      udManager.getStargateRoute(srcToken, dstChainId);

    uint256 bridgeAmount = IERC20(srcToken).balanceOf(address(this));

    // Calculate maximum bridgeable amount based on Stargate pool liquidity
    {
      uint256 conversionRate = Utils._getStargateConversionRate(IERC20(srcToken).decimals());
      uint64 bridgeAmountSD = Utils._ld2sd(bridgeAmount, conversionRate);
      uint64 credit = StargateBase(stargateTokenRoute.srcStargateToken).paths(stargateTokenRoute.dstEid);
      uint64 maxAmountSD = bridgeAmountSD > credit ? credit : bridgeAmountSD;
      bridgeAmount = Utils._sd2ld(maxAmountSD, conversionRate);
    }

    IERC20(srcToken).approve(stargateTokenRoute.srcStargateToken, bridgeAmount);
    (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) =
      quoteStargateFee(bridgeAmount, stargateTokenRoute.srcStargateToken, maxSlippage);
    if (address(this).balance < valueToSend) revert InsufficientNativeToken(address(this).balance, valueToSend);

    (msgReceipt, oftReceipt,) =
      IStargate(stargateTokenRoute.srcStargateToken).sendToken{value: valueToSend}(sendParam, messagingFee, owner()); // Use owner as refundAddress
    nonce += 1;
    emit BridgingInitiated(nonce);
  }
}
