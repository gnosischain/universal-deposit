# Universal Deposit Backend

> Cross-chain USDC bridging service between EDU/Chidao and Gnosis using Stargate + LayerZero

## 🚀 Quick Start

### Option 1: From Backend Directory (Recommended)

```bash
# Navigate to backend
cd packages/backend

# Copy environment configuration
cp .env.example .env
# Edit .env with your configuration

# Start full development environment with hot reloading
pnpm dev:up
```

### Option 2: From Project Root

```bash
# Install dependencies
pnpm install

# Set up backend environment
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your RPC URLs and configuration

# Complete setup and start development environment
pnpm backend:setup
pnpm backend:dev
```

Visit http://localhost:3000/api-docs for API documentation.
Visit http://localhost:3000/metrics for Prometheus metrics.
Health endpoint: http://localhost:3000/api/v1/health

## 🎯 Overview

The Universal Deposit Backend enables seamless cross-chain USDC transfers between EDU chain and Gnosis Chain. Users deposit USDC to generated deterministic universal addresses (UDA), and the system automatically bridges funds using Stargate Protocol.

### How It Works

1. Address Generation: API returns a deterministic UDA computed by ProxyFactory.getUniversalAccount(owner, recipient, destinationChainId)
2. Deposit Detection: Backend monitors UDAs for USDC deposits
3. Automatic Bridging: System deploys proxy if needed and calls settle() to bridge
4. Status Tracking: Real-time order status and transaction tracking

## ✨ Features

- Automated cross-chain bridging via Stargate Protocol
- Deterministic address generation via CREATE2 (ProxyFactory)
- Queue-based processing with retry and DLQ (RabbitMQ with TTL delays)
- Residual handling with long-delay retries (1h → 3h → 6h → 12h → 24h)
- Health checks and Prometheus metrics
- OpenAPI (Swagger UI) for the REST API
- Rate limiting (100 requests per owner per day, planned)

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Balance       │    │   Deploy        │    │   Settle        │
│   Watcher       │    │   Worker        │    │   Worker        │
│                 │    │                 │    │                 │
│ • Monitor USDC  │    │ • Deploy Proxy  │    │ • Bridge via    │
│   deposits      │    │   contracts     │    │   Stargate      │
│ • Create orders │    │ • Retry/DLQ     │    │ • Fees/partial  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                           RabbitMQ                              │
│   orders.direct (direct), orders.dlx (dead-letter)              │
│   deploy.q / settle.q / dlq.q + retry/delay queues              │
└─────────────────────────────────────────────────────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Redis       │    │   REST API      │
│   (Prisma)      │    │ (cache + RL)    │    │  (Fastify)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- Node.js 22 LTS
- pnpm 9+
- Docker and Docker Compose
- PostgreSQL 15+ (via Docker)
- Redis 7+ (via Docker)
- RabbitMQ 3+ (via Docker)

### External Services

- EDU chain RPC endpoint(s)
- Gnosis Chain RPC endpoint
- Private keys for deployment/settlement (funded manually)
- Deployed contracts (ProxyFactory, UD Manager, USDC, Stargate token)

## 🔧 Installation

### 1. Clone and Navigate

```bash
# From monorepo root
pnpm install
```

### 2. Environment Setup

```bash
cp packages/backend/.env.example packages/backend/.env
# Edit the .env to set RPC URLs, contract addresses, keys, etc.
```

### 3. Database Setup

The Docker configuration now handles database setup automatically, including:

- Generating Prisma client
- Creating initial migrations if they don't exist
- Running existing migrations

For manual setup:

```bash
pnpm --filter @universal-deposit/backend prisma:generate
pnpm --filter @universal-deposit/backend db:migrate
```

## ⚙️ Configuration

Key environment variables (see .env.example for full list):

- DATABASE_URL, REDIS_URL, RABBITMQ_URL
- API_PORT, API_SECRET_KEY
- EDU/CHIDAO/GNOSIS RPC URLs + chain IDs
- Contract addresses: ProxyFactory, UD Manager, USDC, Stargate token
- DEPLOYMENT_PRIVATE_KEY, SETTLEMENT_PRIVATE_KEY
- RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS
- RESIDUAL_DELAY_SCHEDULE (ms)
- VERIFY_DEST_CHAIN, ENABLE_MAINNET_TX
- RUN_API, RUN_BALANCE_WATCHER, RUN_DEPLOY_WORKER, RUN_SETTLE_WORKER

## 🛠️ Development

### Available Scripts

#### From Project Root

```bash
# Complete setup and development
pnpm backend:setup          # Install + Prisma generate + migrate
pnpm backend:dev             # Start full development environment
pnpm backend:down            # Stop development environment
pnpm backend:logs            # View backend container logs
pnpm backend:health          # Check backend health
pnpm backend:db:reset        # Reset database
```

#### From Backend Directory

```bash
# Setup and development
pnpm setup                   # Install + Prisma generate + migrate
pnpm dev:full                # Start full development environment with hot reload
pnpm dev:down                # Stop development environment
pnpm dev:logs                # View backend container logs
pnpm dev:restart             # Restart backend container
pnpm health                  # Check backend health
pnpm db:reset                # Reset database

# Individual services (local development)
pnpm dev                     # Start orchestrator (API + workers)
pnpm dev:api                 # Start API server only

# Build and production
pnpm build                   # Build TypeScript
pnpm start                   # Start production server

# Database operations
pnpm prisma:generate         # Generate Prisma client
pnpm db:migrate              # Run database migrations
pnpm db:push                 # Push schema changes
pnpm db:studio               # Open Prisma Studio

# Code quality
pnpm check-types             # TypeScript type checking
pnpm lint                    # Run ESLint
pnpm lint:fix                # Fix ESLint issues
pnpm format                  # Check Prettier formatting
pnpm format:fix              # Fix Prettier formatting
pnpm test                    # Run tests
pnpm test:cov                # Run tests with coverage
```

### Project Structure (backend)

```
packages/backend/
├── src/
│   ├── api/                 # Fastify server, swagger, middleware
│   ├── blockchain/          # Viem clients & contract ABIs (planned)
│   ├── config/              # Zod-validated env
│   ├── monitoring/          # Health & metrics
│   ├── queues/              # RabbitMQ connection & topology
│   ├── services/            # Workers (balance, deploy, settle)
│   ├── utils/               # Logger, helpers
│   └── index.ts             # Orchestrator
├── prisma/
│   └── schema.prisma        # Orders, CachedAddress, DeadLetterQueue
├── .env.example
└── package.json
```

## 📖 API Documentation

- Swagger UI: http://localhost:3000/api-docs
- OpenAPI JSON: http://localhost:3000/api-docs/json

Key endpoints (planned/partially stubbed):

- POST /api/v1/register-address
- GET /api/v1/address
- GET /api/v1/orders/:id
- GET /api/v1/orders
- POST /api/v1/orders/generate-id
- GET /api/v1/health
- GET /metrics

## 🧪 Testing

- Local integration can point to testnet/mainnet RPCs. By default, VERIFY_DEST_CHAIN=false and ENABLE_MAINNET_TX=false to avoid accidental txs.
- CI will use foundry/hardhat for write-path tests.

## 🚀 Deployment

- Node 22 LTS, Docker base image node:22-alpine
- Single image with service toggles (RUN\_\* envs)
- RabbitMQ topology uses TTL-based delay queues, no delayed-message plugin required

## 📊 Monitoring

- /api/v1/health readiness
- /metrics Prometheus metrics (ud_orders_created_total, ud_order_processing_seconds, etc.)

## 🤝 Contributing

- TypeScript, ESLint + Prettier
- Conventional commits recommended
- Keep modules small, maintainable, and reusable. Follow system patterns in docs.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
