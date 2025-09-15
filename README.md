# Universal Deposit

Universal Deposits creates deterministic addresses that can receive tokens from any supported chain. When tokens are deposited, the system can automatically bridge to the destination chain. The v1 is using Stargate Protocol as underlying bridging protocol.

## Overview

This system enables seamless cross-chain USDC bridging through:

-   **Universal Addresses**: Deterministic proxy contracts that can receive USDC deposits
-   **Automated Processing**: Backend workers that detect deposits and execute bridge transactions
-   **API Interface**: REST endpoints for address registration and order tracking
-   **Multi-Chain Support**: Currently supports bridging between EDU Chain and Gnosis Chain

## Architecture

The system consists of three main components:

1. **Smart Contracts**: Universal deposit addresses that can settle cross-chain transfers
2. **Backend Workers**:
    - BalanceWatcher: Monitors deposit addresses for incoming USDC
    - Deploy Worker: Deploys universal addresses on-demand
    - Settle Worker: Executes cross-chain bridging via Stargate
3. **API Service**: Handles address registration, order tracking, and client authentication

## Quick Start

1. **Get API Key** by creating a client:

    ```
    Contact the team to create a client and receive your API key
    Each client has rate limits and access controls
    ```

2. **Register a Universal Address**:

    ```bash
    curl -X POST https://bridge.gnosischain.com/api/v1/register-address \
      -H "X-API-Key: your-api-key" \
      -H "Content-Type: application/json" \
      -d '{
        "ownerAddress": "0x...",
        "recipientAddress": "0x...",
        "destinationChainId": 100,
        "sourceChainId": 41923
      }'
    ```

3. **Send USDC to the returned universal address**

4. **Get order ID** after deposit:

    ```bash
    curl -X GET "https://bridge.gnosischain.com/api/v1/getOrderId" \
      -H "X-API-Key: your-api-key" \
      -H "Content-Type: application/json" \
      -d '{
        "nonce": 0, // Get nonce from UniversalDepositAccount(UDA).nonce()
        "sourceChainId": 41923,
        "destinationChainId": 100,
        "destinationToken": "0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0",
        "recipientAddress": "0x..."
      }'
    ```

5. **Track your order**:
    ```bash
    curl -X GET https://api.example.com/api/v1/orders/{orderId} \
      -H "X-API-Key: your-api-key"
    ```

## Order Flow

1. **CREATED**: Deposit detected and order created
2. **DEPLOYED**: Universal address deployed on-chain (if needed)
3. **COMPLETED**: Cross-chain bridge transaction successful
4. **FAILED**: Order failed after maximum retries

## Supported Routes

-   Edu Chain (41923) ↔ Gnosis Chain (100)
-   Uses Stargate Protocol for bridging with 6bps fee on USDC transfers

## Deployments

| Contract                | Address                                    |
| ----------------------- | ------------------------------------------ |
| UniversalDepositAccount | 0x4Ca33903345deF71a54Bfb26d1F62bEf6cF1fd10 |
| UniversalDepositManager | 0x72439FDa3a67988b241060c0A0d3Cb8AAC123345 |
| ProxyFactory            | 0xa7B9f00E4D8e9B798F79b8585Ac6b3E52158Ce21 |

| Chain        | USDC                                       | Stargate USDC                              |
| ------------ | ------------------------------------------ | ------------------------------------------ |
| Gnosis Chain | 0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0 | 0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3 |
| EDU Chain    | 0x12a272A581feE5577A5dFa371afEB4b2F3a8C2F8 | 0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00 |

[Technical Details](TechnicalDetails.md)

## Disclaimer

This repository uses boilerplate from [Wonderland.xyz](REFERENCE.md)

## Acknowledgement

This project is inspired by [Substance Labs](https://github.com/substance-labs)
