-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL DEFAULT '0000-0000-0000-0000',
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- Add clientId column to Order table
ALTER TABLE "Order" ADD COLUMN "clientId" TEXT DEFAULT '0000-0000-0000-0000';

-- Create unique index on apiKey
CREATE UNIQUE INDEX "Client_apiKey_key" ON "Client"("apiKey");

-- Create index on clientId for performance
CREATE INDEX "Order_clientId_idx" ON "Order"("clientId");

-- Add foreign key constraint
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Insert master client
INSERT INTO "Client" ("id", "name", "apiKey") 
VALUES ('0000-0000-0000-0000', 'Master Developer', 'dev-master-key-change-in-production-32chars');
