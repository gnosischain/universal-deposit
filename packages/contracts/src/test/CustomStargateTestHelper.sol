// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {
  ExecutorConfig, SetDefaultExecutorConfigParam
} from '@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol';
import {IExecutor} from '@layerzerolabs/lz-evm-messagelib-v2/contracts/interfaces/IExecutor.sol';
import {ILayerZeroPriceFeed} from '@layerzerolabs/lz-evm-messagelib-v2/contracts/interfaces/ILayerZeroPriceFeed.sol';
import {SetDefaultUlnConfigParam, UlnConfig} from '@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol';
import {IDVN} from '@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/interfaces/IDVN.sol';
import {EnforcedOptionParam} from '@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OAppOptionsType3.sol';
import {OptionsBuilder} from '@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol';
import {StargateBase} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/StargateBase.sol';
import { FeeLibV1} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/feelibs/FeeLibV1.sol';
import {IStargate} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/interfaces/IStargate.sol';
import {IStargatePool} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/interfaces/IStargatePool.sol';
import {CreditMessaging} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/messaging/CreditMessaging.sol';
import {TokenMessaging} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/messaging/TokenMessaging.sol';
import {LPToken} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/src/utils/LPToken.sol';
import {StargateTestHelper} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/test/StargateTestHelper.sol';
import {LzFixture} from '@stargatefinance/stargate-v2/packages/stg-evm-v2/test/layerzero/LzTestHelper.sol';
import {StdCheats} from 'forge-std/StdCheats.sol';

///@dev The setup is referring from StargateTestHelper, with modified functions to allow custom eid endpoint
contract CustomStargateTestHelper is StargateTestHelper, StdCheats {
  using OptionsBuilder for bytes;

  function setupStargatePoolUSDC(
    uint32 srcEid,
    uint32 dstEid,
    address usdcAddress,
    address stargatePoolAddress
  ) internal returns (LPToken lpToken) {
    {
      // Set up LayerZero endpoint
      LzFixture memory lzFixture = setUpCustomEidEndpoint(srcEid, dstEid);

      // Deploy StargatePool using VM.deployCode
      deployCodeTo(
        'StargatePool.sol:StargatePool',
        abi.encode('LP Name', 'LP', usdcAddress, 18, 6, address(lzFixture.endpoint), address(this)),
        stargatePoolAddress
      );

      FeeLibV1 feeLib = new FeeLibV1(stargatePoolAddress);
      TokenMessaging tokenMessaging = new TokenMessaging(address(lzFixture.endpoint), msg.sender, QUEUE_CAPACITY);

      address planner = address(0x1);
      tokenMessaging.setPlanner(planner);
      VM.prank(planner);
      tokenMessaging.setFares(dstEid, BUS_FARE, NATIVE_DROP_FARE);

      lpToken = LPToken(IStargatePool(stargatePoolAddress).lpToken());

      // Configure AddressConfig
      CreditMessaging creditMessaging = new CreditMessaging(address(lzFixture.endpoint), address(this));
      StargateBase.AddressConfig memory addressConfig = StargateBase.AddressConfig(
        address(feeLib), address(this), address(this), address(tokenMessaging), address(creditMessaging), address(0)
      );

      StargateBase(stargatePoolAddress).setAddressConfig(addressConfig);

      creditMessaging.setPlanner(planner);
      tokenMessaging.setNativeDropAmount(dstEid, NATIVE_DROP_AMOUNT);
      feeLib.setFeeConfig(
        dstEid,
        10_000_000_000, // zone1UpperBound: 0 - 10_000 SD: zone1
        20_000_000_000, // zone2UpperBound: 10_000 - 20_000 SD: zone2,  20_000 SD - unlimited: zone3
        10, // zone1FeeMillionth: 10 bps for zone1 // this is only the StargateInternal fee, but not the Lz nativeFee
        0, // zone2FeeMillionth: no fee for zone2
        0, // zone3FeeMillionth: no fee for zone3
        0 // rewardMillionth: no reward
      );
      // Configure TokenMessaging
      uint16 assetId = 1;

      tokenMessaging.setAssetId(stargatePoolAddress, assetId);
      creditMessaging.setAssetId(stargatePoolAddress, assetId);
      tokenMessaging.setGasLimit(dstEid, MIN_TOKEN_GAS, NATIVE_DROP_GAS_LIMIT);
      creditMessaging.setGasLimit(dstEid, MIN_CREDIT_GAS);
      creditMessaging.setGasLimit(dstEid, MIN_CREDIT_GAS);

      setCustomEnforcedOptions(TokenMessaging(tokenMessaging), dstEid);
      address tokenPeer = address(0x2);
      address creditPeer = address(0x3);
      tokenMessaging.setPeer(dstEid, addressToBytes32(tokenPeer));
      creditMessaging.setPeer(dstEid, addressToBytes32(creditPeer));

      // Initialize the OFT path to allow sending tokens
      StargateBase(stargatePoolAddress).setOFTPath(dstEid, true);
    }
  }

  function setupStargateOFTUSDC(uint32 srcEid, uint32 dstEid, address usdcAddress, address stargateOftAddress) internal {
    {
      // Set up LayerZero endpoint
      LzFixture memory lzFixture = setUpCustomEidEndpoint(srcEid, dstEid);

      // Deploy StargatePool using VM.deployCode
      deployCodeTo(
        'StargateOFT.sol:StargateOFT',
        abi.encode(usdcAddress, 6, address(lzFixture.endpoint), address(this)),
        stargateOftAddress
      );

      FeeLibV1 feeLib = new FeeLibV1(stargateOftAddress);
      TokenMessaging tokenMessaging = new TokenMessaging(address(lzFixture.endpoint), msg.sender, QUEUE_CAPACITY);

      address planner = address(0x1);
      tokenMessaging.setPlanner(planner);
      VM.prank(planner);
      tokenMessaging.setFares(dstEid, BUS_FARE, NATIVE_DROP_FARE);

      // Configure AddressConfig
      CreditMessaging creditMessaging = new CreditMessaging(address(lzFixture.endpoint), address(this));
      StargateBase.AddressConfig memory addressConfig = StargateBase.AddressConfig(
        address(feeLib), address(this), address(this), address(tokenMessaging), address(creditMessaging), address(0)
      );

      StargateBase(stargateOftAddress).setAddressConfig(addressConfig);

      creditMessaging.setPlanner(planner);
      tokenMessaging.setNativeDropAmount(dstEid, NATIVE_DROP_AMOUNT);
      feeLib.setFeeConfig(
        dstEid,
        10_000_000_000, // zone1UpperBound: 0 - 10_000 SD: zone1
        20_000_000_000, // zone2UpperBound: 10_000 - 20_000 SD: zone2,  20_000 SD - unlimited: zone3
        10, // zone1FeeMillionth: 10 bps for zone1 // this is only the StargateInternal fee, but not the Lz nativeFee
        0, // zone2FeeMillionth: no fee for zone2
        0, // zone3FeeMillionth: no fee for zone3
        0 // rewardMillionth: no reward
      );
      // Configure TokenMessaging
      uint16 assetId = 1;

      tokenMessaging.setAssetId(stargateOftAddress, assetId);
      creditMessaging.setAssetId(stargateOftAddress, assetId);
      tokenMessaging.setGasLimit(dstEid, MIN_TOKEN_GAS, NATIVE_DROP_GAS_LIMIT);
      creditMessaging.setGasLimit(dstEid, MIN_CREDIT_GAS);
      creditMessaging.setGasLimit(dstEid, MIN_CREDIT_GAS);

      setCustomEnforcedOptions(TokenMessaging(tokenMessaging), dstEid);
      address tokenPeer = address(0x2);
      address creditPeer = address(0x3);
      tokenMessaging.setPeer(dstEid, addressToBytes32(tokenPeer));
      creditMessaging.setPeer(dstEid, addressToBytes32(creditPeer));

      // Initialize the OFT path to allow sending tokens
      StargateBase(stargateOftAddress).setOFTPath(dstEid, true);
    }
  }

  ///@dev Modified from StargateTestHelper contract to allow customize eid for endpoint

  function setUpCustomEidEndpoint(uint32 eid, uint32 remoteEid) public returns (LzFixture memory lzFixtures) {
    lzFixtures.eid = eid;

    LibraryType libraryType = LibraryType.UltraLightNode;
    InitVerifierParam memory verifierConfig = InitVerifierParam(1, 0, 0);

    // Setup endpoint
    _deployEndpoint(lzFixtures, false); // bool isAlt
    _deployLzToken(lzFixtures);
    _deployTreasury(lzFixtures);
    _deployMessageLibs(lzFixtures);
    _deployPriceFeed(lzFixtures);
    _deployExecutor(lzFixtures);
    _deployDVNs(lzFixtures, verifierConfig);

    _registerFixture(lzFixtures);

    // wire-all modules

    // wire priceFeed
    {
      uint128 denominator = lzFixtures.priceFeed.getPriceRatioDenominator();
      ILayerZeroPriceFeed.UpdatePrice[] memory prices = new ILayerZeroPriceFeed.UpdatePrice[](1);

      // prices[0] = ILayerZeroPriceFeed.UpdatePrice(remoteEid, ILayerZeroPriceFeed.Price(1 * denominator, 1, 1)); // set price to 0

      prices[0] = ILayerZeroPriceFeed.UpdatePrice(remoteEid, ILayerZeroPriceFeed.Price(1 * denominator, 1, 1));
      lzFixtures.priceFeed.setPrice(prices);
    }

    // wire executor
    {
      IExecutor.DstConfigParam[] memory executorConfigParams = new IExecutor.DstConfigParam[](1);
      executorConfigParams[0] = IExecutor.DstConfigParam({
        dstEid: remoteEid,
        baseGas: 5000,
        multiplierBps: 10_000,
        floorMarginUSD: 1e10,
        nativeCap: executorValueCap
      });
      lzFixtures.executor.setDstConfig(executorConfigParams);
    }

    // wire verifier
    {
      IDVN.DstConfigParam[] memory verifierConfigParams = new IDVN.DstConfigParam[](1);
      verifierConfigParams[0] =
        IDVN.DstConfigParam({dstEid: remoteEid, gas: 5000, multiplierBps: 10_000, floorMarginUSD: 1e10});
      for (uint256 i = 0; i < lzFixtures.requiredDVNs.length; i++) {
        lzFixtures.requiredDVNs[i].setDstConfig(verifierConfigParams);
      }
      for (uint256 i = 0; i < lzFixtures.optionalDVNs.length; i++) {
        lzFixtures.optionalDVNs[i].setDstConfig(verifierConfigParams);
      }
    }

    // wire sendUln/receiveUln - verifiers
    {
      SetDefaultUlnConfigParam[] memory ulnParams = new SetDefaultUlnConfigParam[](1);
      address[] memory requiredVerifiers = new address[](verifierConfig.requiredDVNCount);
      for (uint256 i = 0; i < requiredVerifiers.length; i++) {
        requiredVerifiers[i] = address(lzFixtures.requiredDVNs[i]);
      }
      address[] memory optionalVerifiers = new address[](verifierConfig.optionalDVNCount);
      for (uint256 i = 0; i < optionalVerifiers.length; i++) {
        optionalVerifiers[i] = address(lzFixtures.optionalDVNs[i]);
      }
      UlnConfig memory ulnConfig = UlnConfig({
        confirmations: 1,
        requiredDVNCount: verifierConfig.requiredDVNCount,
        optionalDVNCount: verifierConfig.optionalDVNCount,
        optionalDVNThreshold: verifierConfig.optionalDVNThreshold,
        requiredDVNs: requiredVerifiers,
        optionalDVNs: optionalVerifiers
      });
      ulnParams[0] = SetDefaultUlnConfigParam(remoteEid, ulnConfig);
      lzFixtures.sendUln.setDefaultUlnConfigs(ulnParams);
      lzFixtures.receiveUln.setDefaultUlnConfigs(ulnParams);
    }

    // wire sendUln - executor
    {
      SetDefaultExecutorConfigParam[] memory executorParams = new SetDefaultExecutorConfigParam[](1);
      ExecutorConfig memory executorConfig =
        ExecutorConfig({maxMessageSize: 10_000, executor: address(lzFixtures.executor)});
      executorParams[0] = SetDefaultExecutorConfigParam(remoteEid, executorConfig);
      lzFixtures.sendUln.setDefaultExecutorConfigs(executorParams);
    }

    // wire endpoint
    {
      lzFixtures.endpoint.setDefaultSendLibrary(
        remoteEid,
        libraryType == LibraryType.UltraLightNode ? address(lzFixtures.sendUln) : address(lzFixtures.simpleMessageLib)
      );
      lzFixtures.endpoint.setDefaultReceiveLibrary(
        remoteEid,
        libraryType == LibraryType.UltraLightNode
          ? address(lzFixtures.receiveUln)
          : address(lzFixtures.simpleMessageLib),
        0
      );
    }

    return lzFixtures;
  }

  function setCustomEnforcedOptions(TokenMessaging tokenMessaging, uint32 remoteEid) internal {
    bytes memory enforcedOption = OptionsBuilder.newOptions().addExecutorLzReceiveOption(MIN_TOKEN_GAS, 0);

    EnforcedOptionParam memory enforcedOptionParam =
      EnforcedOptionParam({msgType: tokenMessaging.MSG_TYPE_TAXI(), eid: remoteEid, options: enforcedOption});
    EnforcedOptionParam[] memory enforcedOptions = new EnforcedOptionParam[](1);
    enforcedOptions[0] = enforcedOptionParam;

    tokenMessaging.setEnforcedOptions(enforcedOptions);
  }
}
