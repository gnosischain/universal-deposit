-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'DEPLOYED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "universalAddress" VARCHAR(42) NOT NULL,
    "sourceChainId" INTEGER NOT NULL,
    "destinationChainId" INTEGER NOT NULL,
    "recipientAddress" VARCHAR(42) NOT NULL,
    "sourceTokenAddress" VARCHAR(42) NOT NULL,
    "destinationTokenAddress" VARCHAR(42) NOT NULL,
    "ownerAddress" VARCHAR(42) NOT NULL,
    "nonce" INTEGER NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "transactionHash" VARCHAR(66),
    "bridgeTransactionUrl" TEXT,
    "message" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedAddress" (
    "universalAddress" VARCHAR(42) NOT NULL,
    "ownerAddress" VARCHAR(42) NOT NULL,
    "recipientAddress" VARCHAR(42) NOT NULL,
    "destinationChainId" INTEGER NOT NULL,
    "sourceChainId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CachedAddress_pkey" PRIMARY KEY ("universalAddress")
);

-- CreateTable
CREATE TABLE "DeadLetterQueue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "queueName" TEXT NOT NULL,
    "failureReason" TEXT NOT NULL,
    "errorDetails" JSONB,
    "retryCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DeadLetterQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_universalAddress_idx" ON "Order"("universalAddress");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_universalAddress_sourceChainId_nonce_key" ON "Order"("universalAddress", "sourceChainId", "nonce");

-- CreateIndex
CREATE INDEX "CachedAddress_expiresAt_idx" ON "CachedAddress"("expiresAt");
