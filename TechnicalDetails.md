## Smart Contract

### Universal Deposit address

1. Functions
    1. `settle(address srcToken, uint256 maxSlippage) (public, payable)`
        1. quote Stargate fee
            1. 3 parts
                1. 6bps on USDC
                2. gas fee (Sponsored by Paymaster if AA is used)
                3. lz_fee, in native gas token
            2. gas fee in native token https://stargateprotocol.gitbook.io/stargate/v2-user-docs/whats-new-in-stargate-v2/fees#stargate-gas-fees
            3. dynamic transfer fee https://stargateprotocol.gitbook.io/stargate/v2-user-docs/whats-new-in-stargate-v2/fees#stargate-transaction-fees-rebates
        2. call USDC.approve(Stargate) & Stargate.sendToken
        3. nonce +=1
        4. emit `BridgingInitiated(uint256 indexed nonce)`
    2. `receive() external payable`
        1. revert
    3. `withdrawToken(token, receiver) onlyOwner`
        1. Allow the owner to withdraw
        2. Prerequisite: the contract has to be first deployed & set the owner address
        3. emit `WithdrawUnsupportedToken(address indexed token, uint256 indexed amount)`
    4. owner (view)
        1. Address that can call `withdrawToken`
    5. nonce (view)
        1. Incremental counter for bridge operations
    6. version (view)
        1. return `1`, the current version only support Stargate
2. Ownership
    1. `owner` when specify through API `/registerAddress`,

### Proxy

1. https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.4.0/contracts/proxy/ERC1967/ERC1967Proxy.sol
    1. Allow all the proxy clones to point to the same implementation contract, after upgrading.
2. Initialize owner for the implementation contract.

## Proxy Factory

1. Functions
    1. `createUniversalAccount(address _owner, address _recipient, address _destinationChainId)`
        1. call create2 with salt (destination chain id, owner, recipient recipient) to create the proxy contract, initialize (\_owner)
        2. initialize the owner within the same transaction
    2. `getUniversalAccount(address _owner, address _recipient, address _destinationChainId)` (view)

## Backend

1. Off chain services

    1. Three major workers
        1. BalanceWatcher: track USDC balance of the universal address
            1. Watch a list of universal addresses in the cache, and create an order if the USDC balance of the amount is larger than threshold.
        2. Deployer: Deploy universal deposit by calling factory (skip if the universal address is already defined)
        3. Settler:
            1. quote fee
            2. Simulate & Call `settle` function and pay gas fee for user (estimation of fee)
            3. Speed: fast mode(Taxi) as default
    2. Redis is used for cached, PostgreSQL is used for Database, RabbitMQ for queue management.
    3. Error handling
        1. Retry for 5 times after receiving error within certain operation and abandon the order if threshold reached, set STATUS as FAILED → Trigger Alerts.
        2. The error will most likely coming from on chain bridge operation (i.e. bridge limit reached, not enough credit from Stargate), hence we need to have exponential time for fallback operation.
        3. Dead letter queue system for failed messages that exceed retry limits.
        4. Recovery system to detect and reprocess incomplete orders.
    4. Requirement
        1. No duplicate order in the process.

1. Order workflow:
    1. Order Creation: When BalanceWatcher detected balance > threshold, it creates an order in database and push the order into the deploy queue.
        1. ORDER STATUS: CREATED
        2. Deploy queue will check if universal address is deployed (creationCode > 0), and call proxy factory for deployment. Once finished, pushed to Settle Queue.
            1. ORDER STATUS: DEPLOYED
    2. Order Settlement:
        1. quote fee for the settle function call → simulate `settle` function call → call on chain `settle` function → update the url of bridging transaction from ${layerzero scan url}/${txHash}
        2. ORDER STATUS: COMPLETED
    3. Error handling:
        1. ORDER STATUS: FAILED , ${err msg}
1. Order Status Flow
    1. A deposit is detected, and an order is created (`CREATED`).
    2. The proxy contract is deployed if it doesn't exist (`DEPLOYED`).
    3. The `settle()` function is called and the bridge transaction is confirmed (`COMPLETED`).

> The `nonce` is a critical link between the off-chain order schema and the on-chain smart contract state. Each successful `settle()` call increments the contract's nonce, ensuring that the `keccak256` hash for subsequent orders will be unique.

```mermaid
flowchart TD
  %% Components
  subgraph BW [BalanceWatcher]
    BWDetect[detect deposit<br/>on-chain → DB]
  end

  subgraph DeployQ [Deploy Queue]
    DQ[enqueue orderId]
  end

  subgraph DW [Deploy Worker]
    DWClaim[claim order if status = CREATED]
    DWDeploy[deploy proxy on‐chain]
    DWSuccess[set status = DEPLOYED<br/>enqueue settle]
    DWRetry[status ← CREATED<br/>retry/backoff]
    DWFail[status = FAILED<br/>DLQ]
  end

  subgraph SWQ [Settle Queue]
    SQ[enqueue orderId]
  end

  subgraph SW [Settle Worker]
    SWClaim[claim order if status = DEPLOYED]
    SWSim[simulate & settle on-chain]
    SWSuccess[status = COMPLETED]
    SWRetry[status ← DEPLOYED<br/>retry/backoff]
    SWFail[status = FAILED<br/>DLQ]
  end

  %% Flow
  BWDetect -->|new deposit| CreateOrder[/INSERT order<br/>status = CREATED/]
  CreateOrder --> |upsert & outbox| DQ

  DQ --> DWClaim
  DWClaim -->|0 rows? ack & remove| EndDeploySkip[/skip/]
  DWClaim -->|1 row| DWDeploy
  DWDeploy -->|success| DWSuccess
  DWDeploy -->|error & attempts < max| DWRetry
  DWDeploy -->|error & attempts ≥ max| DWFail

  DWSuccess --> SQ

  SQ --> SWClaim
  SWClaim -->|0 rows? ack & remove| EndSettleSkip[/skip/]
  SWClaim -->|1 row| SWSim
  SWSim -->|success| SWSuccess
  SWSim -->|error & attempts < max| SWRetry
  SWSim -->|error & attempts ≥ max| SWFail

  style EndDeploySkip fill:#f9f,stroke:#333,stroke-width:1px
  style EndSettleSkip fill:#f9f,stroke:#333,stroke-width:1px
```

1. API
    1. Endpoint
        1. `register-address` (POST /api/v1/register-address)
            1. input: ownerAddress, recipientAddress, destinationChainId, sourceChainId
            2. output: universal address
            3. TTL: 24 hrs
            4. Authentication: Requires API key (X-API-Key header)
            5. Use case:
                1. To get the universal address
                2. To store the universal address in cache for the balance watcher.
        2. `getOrderByParams`
            1. input: universal address, source chain id, nonce (contract nonce). One can query the latest nonce by calling on-chain contract `nonce`.
            2. output: Order information (Check the Order schema below)
        3. `getOrderById`
            1. input: order Id
            2. output: Order information (Check the Order schema below)
        4. `getOrderId`
            1. input: {nonce, source chain Id, destination chain Id, destination token, recipient address}
            2. output: Order Id
        5. `health` (GET /api/v1/health) - no authentication required
        6. `supportedRoutes`
            1. return {routes: [`source chain Id`, `destination chain id`]}
        7. `address` (GET /api/v1/address)
            1. input: ownerAddress, recipientAddress, destinationChainId, sourceChainId
            2. output: universal address (compute only, no caching)
        8. `me` (GET /api/v1/me) - returns authenticated client information
    2. API authentication
        1. Header-based API key authentication (X-API-Key)
        2. Client management system with active/inactive status
        3. Master client privileges for admin operations
    3. Rate limiting
        1. Global rate limit: 1000 requests/minute
        2. Per-owner daily rate limit for address registration
2. Error Handling

### Order Schema

-   **id**: `String`
    -   A unique order identifier. The docs specify this is generated by `keccak256(universal-address, destination recipient, destination token, destination chain, nonce)`.
-   **universalAddress**: `String`
    -   The unique deposit address for the user, a proxy contract on the source chain.
-   **sourceChainId**: `Number`
    -   The chain ID where the user's funds originate (e.g., Edu Chain).
-   **destinationChainId**: `Number`
    -   The chain ID where the funds are being sent (e.g., Gnosis Chain).
-   **recipientAddress**: `String`
    -   The address on the **destination chain** that will receive the funds.
-   **destinationTokenAddress**: `String`
    -   The address of the token on the **destination chain** to be received (e.g., USDC.e).
-   **refundAddress**: `String`
    -   The address designated by the user to own the universal address and receive any withdrawn tokens.
-   **nonce**: `Number`
    -   A unique, incremental number for each settlement transaction on the universal address.
-   **amount**: `Number`
    -   The amount of USDC deposited by the user, detected by the `BalanceWatcher`.
-   **status**: `String`
    -   The current state of the order, which can be one of the following:
        -   `CREATED`: The deposit has been detected, and an order has been created.
        -   `DEPLOYED`: The universal address has been deployed on-chain.
        -   `COMPLETED`: The cross-chain bridge transaction has been successfully completed.
        -   `FAILED`: The order failed after the maximum number of retries.
-   **transactionHash**: `String` (optional)
    -   The transaction hash of the on-chain `settle()` call.
-   **bridgeTransactionUrl**: `String` (optional)
    -   A link to the LayerZero Scan or other relevant explorer for the cross-chain bridging transaction.
-   **timestamp**: `String`
    -   The timestamp of the order's creation. This should be an ISO 8601 formatted string for consistency.
-   **message**: `String` (optional)
    -   A string to store any relevant error messages or additional information about the order's status.
-   **retries**: `Number` (internal)
    -   An internal counter for the number of retry attempts for a failed operation. This is crucial for the error handling logic.
-   **sourceTokenAddress**: `String`
    -   The address of the source token (USDC) on the source chain.
-   **clientId**: `String` (optional)
    -   The ID of the client that created this order, used for access control and filtering.

## Requirement

1. Output should be containerized into docker and easily managed by Devops.

## Edge case

1. User sends unsupported fund
    1. Call withdrawToken if they have the control to the owner address
2. User sends less than minimum amount of token
    1. User has to resend more token. Call `/registerAddress` API again.
3. User sends more than enough amount of token and the bridging limit is reach
    1. The system will reprocess the order after X amount of time.
        1. will first quote Stargate → quote the amount if correct → bridge the maximum amount available → wait → repeat for second order
4. User deposits on the wrong chain
    1. Reach out to the team and redeploy it as long as the route is supported by Stargate

## Limitation

1. All the USDC amount will be bridged as long as the limit is enough
2. No slippage configuration or bridge amount configuration from API
3. Calldata execution is not allowed

## Cost estimation

1. On chain caller cost:
    1. gas fee for calling `settle` (can be sponsored by EDU Chain AA Paymaster)
    2. native gas token in `msg.value` after calling `quoteStargateFee` (has to pre-fund the caller and monitor the balance)
    3. 6bps charged from the bridging token. (automatically deducted from the USDC balance)

## Workflow

```mermaid
sequenceDiagram
    participant User
    participant API as Bridge API
    participant Redis as Redis Cache
    participant Contract as Universal Address
    participant BW as BalanceWatcher
    participant DQ as Deploy Queue
    participant DW as Deploy Worker
    participant SQ as Settle Queue
    participant SW as Settle Worker
    participant DB as PostgreSQL
    participant Stargate as Stargate Protocol
    participant Dest as Destination Chain

    Note over User, Dest: Example: Bridge USDC from Edu Chain → Gnosis Chain

    %% Registration Phase
    User->>+API: POST /api/v1/register-address
    Note right of User: { ownerAddress, recipientAddress, destinationChainId, sourceChainId }<br/>X-API-Key: client-api-key
    API->>API: Authenticate API key
    API->>API: Validate route & rate limits
    API->>Contract: getUniversalAccount(owner, recipient, destChainId)
    Contract-->>API: universalAddress
    API->>Redis: Cache UDA (24h TTL)
    API-->>-User: { universalAddress: "0xabc..." }

    %% Deposit Phase
    User->>Contract: Send USDC to Universal Address
    Note right of User: Transfer USDC to 0xabc...

    %% Detection & Processing
    loop Every BALANCE_CHECK_INTERVAL_MS
        BW->>+Redis: listUDAAddresses()
        Redis-->>-BW: [cached addresses]
        BW->>Contract: balanceOf(universalAddress)
        Contract-->>BW: current balance
        BW->>Contract: nonce() [if balance > threshold]
        Contract-->>BW: current nonce
        BW->>DB: ensureOrder(orderId, CREATED)
        BW->>DQ: enqueueDeploy(orderId)
    end

    %% Deploy Phase
    DQ->>+DW: consume deploy message
    DW->>DB: getOrderById(orderId) [status = CREATED]
    DW->>Contract: getBytecode(universalAddress)
    Contract-->>DW: bytecode (or empty if not deployed)
    alt Already Deployed
        DW->>DB: updateOrderStatus(DEPLOYED)
        DW->>SQ: enqueueSettle(orderId)
    else Not Deployed
        DW->>Contract: createUniversalAccount(owner, recipient, destChainId)
        Contract-->>DW: deployment tx
        DW->>DB: updateOrderStatus(DEPLOYED, txHash)
        DW->>SQ: enqueueSettle(orderId)
    end
    DW-->>-DQ: ack message

    %% Settlement Phase
    SQ->>+SW: consume settle message
    SW->>DB: getOrderById(orderId) [status = DEPLOYED]
    SW->>Contract: balanceOf(universalAddress)
    Contract-->>SW: current balance
    SW->>Contract: quoteStargateFee(amount, srcToken, slippage)
    Contract-->>SW: fee quote
    SW->>Contract: settle(srcToken, maxSlippage) {value: fee}
    Contract->>Stargate: approve(stargatePool, amount)
    Contract->>Stargate: sendToken(amount, destChain, recipient)
    Stargate->>Dest: Cross-chain message
    Dest-->>SW: Settlement confirmation via tx receipt
    SW->>DB: updateOrderStatus(COMPLETED, txHash, bridgeUrl)
    SW-->>-SQ: ack message

    %% Error Handling & Retries
    Note over DW, SW: On errors: retry with exponential backoff<br/>1s → 5s → 30s → 2m → 10m<br/>After max retries: FAILED status + DLQ

    %% Status Tracking
    User->>+API: GET /api/v1/orders/{orderId}
    API->>API: Authenticate & filter by clientId
    API->>DB: getOrderById(orderId, clientId)
    DB-->>API: order details
    API-->>-User: { id, status, amount, txHash, bridgeUrl, ... }
```

1. Top up (bridge USDC from Edu chain to Gnosis Chain)
    1. User inserts the recipient address on Gnosis Chain (Gnosis Pay address)
        1. API call `POST /api/v1/register-address` `{ownerAddress, recipientAddress, destinationChainId, sourceChainId}` with API key authentication and return the universal-address
        2. universal-address is now cached in Redis for TTL (24 hrs) for balance monitoring. One has to call the registration endpoint again if not sending min amount of USDC to the universal-address.
    2. User sends the USDC to the universal-address
        1. Balance has increased and detected by the backend.
        2. Backend starts processing the fund
    3. Status of the order can be found by calling API /getStatusByOrderId
        1. Return the status and link to layerzero scan if the order is being processed
2. Withdraw (bridge USDC from Gnosis Chain to Edu Chain)
    1. same as top up but opposite direction

# FAQ

1. What is the USDC token type on Edu Chain?
    1. Hydra OFT
2. What is the USDC token type on Gnosis Chain?
    1. [Pool OFT](https://docs.stargate.finance/resources/contracts/mainnet-contracts#gnosis-endpointid-30145)
