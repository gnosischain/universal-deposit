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

Check out this sample script for end to end workflow interacting with the API: https://github.com/zengzengzenghuy/universal-deposit-test-script/blob/main/src/index.js#L15

1. **Get API Key** by creating a client:

    ```
    Contact the team to create a client and receive your API key
    Each client has rate limits and access controls
    ```

2. **Register a Universal Address**:

    ```bash
    curl -X POST https://dev.universal-deposit.gnosisdev.com/api/v1/register-address \
      -H "X-API-Key: your-api-key" \
      -H "Content-Type: application/json" \
      -d '{
        "ownerAddress": "0x...",
        "recipientAddress": "0x...",
        "destinationChainId": 100,
        "sourceChainId": 41923
      }'
    ```


3. Get UD account nonce from on chain view function.
  
  To track the order of an UD account, we need to get the nonce (uint256) from the account, which will be used for calling the next step.
  Nonce starts from 0 and increment by 1.

  ```javascript
  nonce = UniversalDepositAccount(UDA).nonce();
  ``` 

3. **Send USDC to the returned universal address**

4. **Get order by parameters** after deposit:

    ```bash
    curl -X GET "https://dev.universal-deposit.gnosisdev.com/api/v1/orders" \
      -H "X-API-Key: your-api-key" \
      -H "Content-Type: application/json" \
      -d '{
        "universalAddress: "",
        "sourceChainId": 41923,
        "nonce": 0, // Get nonce from UniversalDepositAccount(UDA).nonce()
        "limit": 10 // max number of orders to return
      }'
    ```

   Or get order by order ID        

    1. Fetch order ID    

    ```bash
      curl -X POST "https://dev.universal-deposit.gnosisdev.com/api/v1/orders/generate-id" \
        -H "X-API-Key: your-api-key" \
        -H "Content-Type: application/json" \
        -d '{
          "universalAddress": "0x51267eF162Ec87b31156D45Ee42FfeCCA6F0eDC7",
          "ownerAddress": "0xdCee7AE1c68Aa8EFECB3659BD4255b409d28e174",
          "recipientAddress": "0x627A7Dd7a8CA2AD40D0f8F9BAA6d555A2CBa44be",
          "destinationTokenAddress": "0xa6EB03C04e4dd63B6EeaC39CDA3c0058433D9885",
          "sourceChainId": 1,
          "destinationChainId": 1,
          "nonce": 0
        }'
    ```

    Return 

    ```bash
    {
      "orderId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
    }
    ```

    2. Get order by order ID    
    ```bash
    curl -X GET "https://dev.universal-deposit.gnosisdev.com/api/v1/orders/{orderId}" \
      -H "X-API-Key: your-api-key" \
      -H "Content-Type: application/json" 
    ```


## Order Flow

1. **CREATED**: Deposit detected and order created
2. **DEPLOYED**: Universal address deployed on-chain (if needed)
3. **COMPLETED**: Cross-chain bridge transaction successful
4. **FAILED**: Order failed after maximum retries

## Supported Routes

-   Edu Chain (41923) ↔ Gnosis Chain (100) 
-   Arbitrum  (42161) ↔ Gnosis Chain (100) 
-   Edu Chain (41923) ↔ Arbitrum (42161) 
-   Uses Stargate Protocol for bridging with 6bps fee on USDC transfers

## Deployments

| Contract                | Address                                    |
| ----------------------- | ------------------------------------------ |
| UniversalDepositAccount | 0xA7FEbF3D2c50076eb92eE79BA6083E51873528DD |
| UniversalDepositManager | 0x72439FDa3a67988b241060c0A0d3Cb8AAC123345 |
| ProxyFactory            | 0x976E725beeaf694Fe79cA50CD9B3b657193FcDb0 |

| Chain        | USDC                                       | Stargate USDC                              |
| ------------ | ------------------------------------------ | ------------------------------------------ |
| Gnosis Chain | 0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0 | 0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3 |
| EDU Chain    | 0x12a272A581feE5577A5dFa371afEB4b2F3a8C2F8 | 0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00 |
| Arbitrum     | 0xaf88d065e77c8cc2239327c5edb3a432268e5831 | 0xe8CDF27AcD73a434D661C84887215F7598e7d0d3 |

[Technical Details](TechnicalDetails.md)

## Disclaimer

This repository uses boilerplate from [Wonderland.xyz](REFERENCE.md)

## Acknowledgement

This project is inspired by [Substance Labs](https://github.com/substance-labs)
