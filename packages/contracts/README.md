# Universal Deposit Contracts

## Overview

The Universal Deposit system consists of two main contracts that work together to facilitate cross-chain token transfers:

### UniversalDepositManager

Central registry contract that manages routing configurations for cross-chain transfers:

-   **Token Routes**: Maps source tokens to destination tokens across different chains
-   **Stargate Routes**: Maps tokens to their corresponding Stargate pools/OFTs for bridging
-   **Chain ID to EID Mapping**: Converts standard chain IDs to LayerZero Endpoint IDs
-   **Access Control**: Owner-controlled route configuration and token support management

Key functions:

-   `setRoute()`: Configure basic token routing between chains
-   `setStargateRoute()`: Configure Stargate-specific routing with pool/OFT addresses
-   `getStargateRoute()`: Retrieve routing information for a given source token

### UniversalDepositAccount

User-controlled proxy contracts deployed per destination chain:

-   **Upgradeable**: Deployed as minimal proxies with shared implementation
-   **Owner-Controlled**: Each account is owned by the user who created it
-   **Destination-Specific**: One account per user per destination chain
-   **Automated Settlement**: Bridges entire token balance when `settle()` is called

Key functions:

-   `settle()`: Initiates cross-chain transfer of all deposited tokens using Stargate
-   `quoteStargateFee()`: Returns required native token amount for bridging fees
-   `withdrawToken()`: Emergency withdrawal for unsupported tokens (owner only)

### ProxyFactory

Factory contract that deploys UniversalDepositAccount instances as minimal proxies:

-   **Gas Efficient**: Uses CREATE2 for deterministic addresses and minimal proxy pattern
-   **Deterministic Addresses**: Same inputs always generate the same account address
-   **One Per Route**: Creates unique accounts for each (owner, recipient, destinationChain) combination
-   **Initialization**: Automatically initializes proxies with correct parameters

## Architecture

```
User deposits tokens → UniversalDepositAccount → Stargate Bridge → Destination Chain
                          ↑
                    Routing info from
                  UniversalDepositManager
```

1. Users deposit supported tokens into their UniversalDepositAccount
2. Anyone can call `settle()` to trigger the bridge (paying gas fees)
3. The account queries UniversalDepositManager for routing information
4. Tokens are bridged via Stargate to the configured destination address
5. User receives bridged tokens on the destination chain

## Setup

1. Change package name to your own in [`package.json`](./package.json)
2. Install dependencies running `pnpm install`

## Available Scripts

Available scripts that can be run using `pnpm`:

| Script           | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `build`          | Build contracts using Foundry's forge                     |
| `lint`           | Run forge fmt and solhint on all contracts                |
| `lint:fix`       | Run linter and automatically fix code formatting issues.  |
| `lint:sol-logic` | Run forge fmt and solhint on contracts                    |
| `lint:sol-tests` | Run forge fmt and solhint on test contracts               |
| `format:check`   | Check code formatting and linting without making changes. |
| `test:unit`      | Run unit tests using forge                                |
| `test:fork`      | Run fork tests with forge                                 |

### Finding compiled contracts output

By default, forge writes output to [out](./out) folder which is not git-tracked.
There you can find all contracts output including their respective ABIs,
deployment bytecode and more stuff

## Design patterns

### Access Control

-   **UniversalDepositManager**: Owner-controlled contract with privileged functions for route configuration
-   **UniversalDepositAccount**: Each account is owned by the user who created it
-   **ProxyFactory**: Immutable factory with no privileged access controls

### Upgradability

-   **UniversalDepositAccount**: Uses OpenZeppelin's upgradeable proxy pattern (ERC1967Proxy)
-   **Implementation Safety**: Constructor is disabled with `_disableInitializers()` to prevent direct usage
-   **Initialization**: Single-use `initialize()` function with proper validation

### Cross-Chain Integration

-   **Stargate V2 Dependency**: Relies on Stargate protocol for cross-chain bridging
-   **LayerZero Integration**: Uses LayerZero's endpoint IDs and messaging system
-   **Slippage Protection**: Automatic minimum amount calculation from Stargate quotes

### Key Security Features

-   **Deterministic Addresses**: CREATE2 ensures predictable proxy addresses
-   **Token Validation**: Only supported tokens can be bridged
-   **Fee Management**: Native token balance checks prevent failed transactions
-   **Emergency Withdrawal**: Owner can withdraw unsupported tokens

### Potential Risk Areas

1. **Stargate Pool Liquidity**: Settlement may be limited by available liquidity
2. **Native Token Requirements**: Settlement caller must provide sufficient native tokens for fees
3. **Route Configuration**: Incorrect route setup could prevent bridging
4. **Proxy Initialization**: Multiple initialization attempts are prevented but should be verified

## Developer Integration Guide

### Contract Addresses

Deploy in the following order:

1. **UniversalDepositAccount** (implementation)
2. **UniversalDepositManager** (singleton)
3. **ProxyFactory** (with implementation and manager addresses)

### Basic Integration Flow

```solidity
// 1. Configure routing in UniversalDepositManager
UniversalDepositManager.StargateTokenRoute memory route = UniversalDepositManager.StargateTokenRoute({
    srcStargateToken: sourceStargatePool,
    dstStargateToken: destStargatePool,
    srcEid: sourceLayerZeroEid,
    dstEid: destLayerZeroEid,
    tokenRoute: UniversalDepositManager.TokenRoute({
        srcToken: sourceTokenAddress,
        dstToken: destTokenAddress,
        srcChainId: sourceChainId,
        dstChainId: destChainId
    })
});
manager.setStargateRoute(route);

// 2. Create user deposit account
address userAccount = factory.createUniversalAccount(
    userAddress,      // owner
    recipientAddress, // recipient on destination chain
    destChainId      // destination chain
);

// 3. User deposits tokens to the account
IERC20(sourceToken).transfer(userAccount, amount);

// 4. Anyone can trigger settlement (paying fees)
uint256 feeRequired = IUniversalDepositAccount(userAccount).quoteStargateFee(
    amount,
    sourceStargatePool,
    maxSlippage
);
IUniversalDepositAccount(userAccount).settle{value: feeRequired}(sourceToken, maxSlippage);
```

### Key Interfaces

#### UniversalDepositManager

-   `setStargateRoute(StargateTokenRoute)` - Configure bridging routes
-   `getStargateRoute(address)` - Retrieve route for token
-   `isTokenSupported(address)` - Check token support

#### UniversalDepositAccount

-   `settle(address, uint256)` - Bridge entire balance of specified token
-   `quoteStargateFee(uint256, address, uint256)` - Get required native token fee, updated sendParam
-   `withdrawToken(address, uint256)` - Emergency withdrawal (owner only)

#### ProxyFactory

-   `createUniversalAccount(address, address, uint256)` - Deploy new account
-   `getUniversalAccount(address, address, uint256)` - Predict account address

### Integration Notes

-   Each user needs one account per destination chain
-   Accounts bridge entire token balance or maximum available Stargate liquidity limit when `settle()` is called
-   Native tokens are required for LayerZero messaging fees

### Testing

-   Unit tests available in `test/unit/`
-   Fork tests demonstrate integration with Stargate V2 in `test/fork/`
-   Run with `pnpm test:unit` or `pnpm test:fork`

## Deployment

1. Gnosis Chain
2. Arbitrum
3. Base
4. Ethereum
5. Optimism
6. EDU Chain

| Contract                | Address                                    |
| ----------------------- | ------------------------------------------ |
| UniversalDepositAccount | 0xA7FEbF3D2c50076eb92eE79BA6083E51873528DD |
| UniversalDepositManager | 0x72439FDa3a67988b241060c0A0d3Cb8AAC123345 |
| ProxyFactory            | 0x976E725beeaf694Fe79cA50CD9B3b657193FcDb0 |

## References

-   [Foundry docs](https://book.getfoundry.sh/forge/)
-   [Foundry repo](https://github.com/foundry-rs)
-   [Stargate V2 Documentation](https://docs.stargate.finance/)
-   [LayerZero V2 Documentation](https://docs.layerzero.network/)
-   [OpenZeppelin Upgrades](https://docs.openzeppelin.com/upgrades-plugins/)

## Future Roadmap

-   Integrating with more bridges options
-   Using deterministic deployment library like [createX](https://github.com/pcaversaccio/createx)
