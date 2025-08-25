#!/bin/bash

# Fork Test Scenarios Script
# Tests all cross-chain bridging scenarios: OFT->Pool, OFT->OFT, Pool->OFT, Pool->Pool

set -e

echo "🚀 Running Fork Test Scenarios..."
echo "================================="

# Scenario 1: OFT Chain (Rari) to Pool Chain (Gnosis)
echo ""
echo "📋 Scenario 1: OFT Chain (Rari) → Pool Chain (Gnosis)"
echo "Source: Rari Chain (OFT) | Destination: Gnosis Chain (Pool)"
echo "-------------------------------------------------------"
USDC=0xFbDa5F676cB37624f28265A144A48B0d6e87d3b6 \
STARGATE_USDC=0x875bee36739e7Ce6b60E056451c556a88c59b086 \
DST_EID=30145 \
DST_CHAINID=100 \
IS_TO_OFT_CHAIN=false \
forge test --match-contract forkTestOFTChain --fork-url https://mainnet.rpc.rarichain.org/http -v

# Scenario 2: OFT Chain (Rari) to OFT Chain (Taiko)
echo ""
echo "📋 Scenario 2: OFT Chain (Rari) → OFT Chain (Taiko)"
echo "Source: Rari Chain (OFT) | Destination: Taiko Chain (OFT)"
echo "-----------------------------------------------------"
USDC=0xFbDa5F676cB37624f28265A144A48B0d6e87d3b6 \
STARGATE_USDC=0x875bee36739e7Ce6b60E056451c556a88c59b086 \
DST_EID=30290 \
DST_CHAINID=167009 \
IS_TO_OFT_CHAIN=true \
forge test --match-contract forkTestOFTChain --fork-url https://mainnet.rpc.rarichain.org/http -v

# Scenario 3: Pool Chain (Gnosis) to OFT Chain (Rari)
echo ""
echo "📋 Scenario 3: Pool Chain (Gnosis) → OFT Chain (Rari)"
echo "Source: Gnosis Chain (Pool) | Destination: Rari Chain (OFT)"
echo "--------------------------------------------------------"
USDC=0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0 \
STARGATE_USDC=0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3 \
DST_EID=30235 \
DST_CHAINID=1380012617 \
IS_TO_OFT_CHAIN=true \
forge test --match-contract forkTestPool --fork-url https://rpc.gnosischain.com -v

# Scenario 4: Pool Chain (Gnosis) to Pool Chain (Ethereum)
echo ""
echo "📋 Scenario 4: Pool Chain (Gnosis) → Pool Chain (Ethereum)"
echo "Source: Gnosis Chain (Pool) | Destination: Ethereum (Pool)"
echo "----------------------------------------------------------"
USDC=0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0 \
STARGATE_USDC=0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3 \
DST_EID=30101 \
DST_CHAINID=1 \
IS_TO_OFT_CHAIN=false \
forge test --match-contract forkTestPool --fork-url https://rpc.gnosischain.com -v

echo ""
echo "✅ All fork test scenarios completed!"
echo "===================================="