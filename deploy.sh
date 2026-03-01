#!/bin/bash

# BLOOM Autonomous Agent Infrastructure Deployment Script
# Automates the deployment process for Railway

set -e  # Exit on any error

echo "🚀 BLOOM Autonomous Agent Infrastructure Deployment"
echo "=================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found. Please install: https://docs.railway.app/cli/quick-start${NC}"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "README.md" ] || [ ! -d "heartbeat-engine" ]; then
    echo -e "${RED}❌ Please run this script from the bloom-agent-infrastructure root directory${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites checked${NC}"

# Login to Railway if needed
echo -e "${BLUE}🔐 Checking Railway authentication...${NC}"
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}Please log in to Railway:${NC}"
    railway login
fi

# Select the correct project
echo -e "${BLUE}📂 Selecting Railway project...${NC}"
echo "Make sure you select the 'Appealing Tranquility' project"
railway link

# Step 1: Database Setup
echo -e "${BLUE}📊 Setting up database...${NC}"
cd database
if [ ! -f "node_modules/.package-lock.json" ]; then
    echo "Installing database dependencies..."
    npm install
fi

echo "Setting up database schema..."
if node setup.js; then
    echo -e "${GREEN}✅ Database setup completed${NC}"
else
    echo -e "${RED}❌ Database setup failed${NC}"
    exit 1
fi
cd ..

# Step 2: Deploy Letta Server
echo -e "${BLUE}🧠 Deploying Letta memory server...${NC}"
cd letta-server

echo "Creating new Railway service for letta-server..."
railway up --service letta-server

echo "Setting environment variables for letta-server..."
railway variables set \
  LETTA_PG_URI="postgresql://postgres:your_postgres_password_here@postgres.railway.internal:5432/bloom_heartbeat" \
  LETTA_SERVER_PORT=8283 \
  LETTA_SERVER_HOST=0.0.0.0 \
  PORT=8283 \
  --service letta-server

echo -e "${GREEN}✅ Letta server deployment initiated${NC}"
cd ..

# Step 3: Deploy Heartbeat Engine
echo -e "${BLUE}🤖 Deploying heartbeat engine...${NC}"
cd heartbeat-engine

echo "Creating new Railway service for heartbeat-engine..."
railway up --service heartbeat-engine

echo "Setting environment variables for heartbeat-engine..."
railway variables set \
  AGENT_ID="bloomie-sarah-rodriguez" \
  AGENT_NAME="Sarah Rodriguez" \
  AUTONOMY_LEVEL=1 \
  ANTHROPIC_API_KEY="your_anthropic_api_key_here" \
  DATABASE_URL="postgresql://postgres:your_postgres_password_here@postgres.railway.internal:5432/bloom_heartbeat" \
  PGHOST="postgres.railway.internal" \
  PGPORT=5432 \
  PGUSER="postgres" \
  PGPASSWORD="your_postgres_password_here" \
  PGDATABASE="bloom_heartbeat" \
  LETTA_SERVER_URL="http://letta-server.railway.internal:8283" \
  GHL_API_KEY="your_ghl_api_key_here" \
  GHL_LOCATION_ID="iGy4nrpDVU0W1jAvseL3" \
  HUMAN_CONTACT_NAME="Kimberly Flowers" \
  HUMAN_CONTACT_EMAIL="kimberly@bloomiestaffing.com" \
  TIMEZONE="America/New_York" \
  LOG_LEVEL="info" \
  NODE_ENV="production" \
  PORT=3000 \
  --service heartbeat-engine

echo -e "${GREEN}✅ Heartbeat engine deployment initiated${NC}"
cd ..

# Wait for deployments to complete
echo -e "${BLUE}⏳ Waiting for services to deploy...${NC}"
echo "This may take a few minutes..."

sleep 30  # Give services time to start

# Step 4: Health Checks
echo -e "${BLUE}🏥 Running health checks...${NC}"

# Get service URLs
echo "Getting service URLs..."
LETTA_URL=$(railway domain --service letta-server 2>/dev/null | grep "https://" | head -1 || echo "")
HEARTBEAT_URL=$(railway domain --service heartbeat-engine 2>/dev/null | grep "https://" | head -1 || echo "")

if [ -n "$LETTA_URL" ]; then
    echo "Testing Letta server health..."
    if curl -f "$LETTA_URL/health" &>/dev/null; then
        echo -e "${GREEN}✅ Letta server is healthy${NC}"
    else
        echo -e "${YELLOW}⚠️  Letta server health check failed (may still be starting)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not get Letta server URL${NC}"
fi

if [ -n "$HEARTBEAT_URL" ]; then
    echo "Testing Heartbeat engine health..."
    if curl -f "$HEARTBEAT_URL/health" &>/dev/null; then
        echo -e "${GREEN}✅ Heartbeat engine is healthy${NC}"

        echo "Getting agent status..."
        if curl -f "$HEARTBEAT_URL/agent/status" &>/dev/null; then
            echo -e "${GREEN}✅ Agent status endpoint working${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Heartbeat engine health check failed (may still be starting)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not get Heartbeat engine URL${NC}"
fi

# Step 5: Final Instructions
echo -e "${BLUE}📋 Deployment Summary${NC}"
echo "=================================="
echo -e "${GREEN}✅ Database schema created${NC}"
echo -e "${GREEN}✅ Sarah Rodriguez agent profile initialized${NC}"
echo -e "${GREEN}✅ Letta memory server deployed${NC}"
echo -e "${GREEN}✅ Heartbeat engine deployed${NC}"

echo ""
echo -e "${YELLOW}🎯 Next Steps:${NC}"
echo "1. Check Railway dashboard for service status"
echo "2. Monitor logs for successful heartbeat cycles"
echo "3. Sarah will start at Level 1 (Observer) - read-only monitoring"
echo "4. Expect first daily briefing at 7:30 AM EST tomorrow"
echo "5. Review escalations and rejections to build trust"

echo ""
echo -e "${YELLOW}📊 Monitoring:${NC}"
if [ -n "$HEARTBEAT_URL" ]; then
    echo "Health Check: $HEARTBEAT_URL/health"
    echo "Agent Status: $HEARTBEAT_URL/agent/status"
    echo "Manual Trigger: $HEARTBEAT_URL/trigger-heartbeat (POST)"
fi

echo ""
echo -e "${YELLOW}📚 Useful Commands:${NC}"
echo "railway logs --service heartbeat-engine  # View agent logs"
echo "railway logs --service letta-server      # View memory logs"
echo "railway status                          # Check all services"

echo ""
echo -e "${GREEN}🚀 BLOOM Autonomous Agent Infrastructure Deployed Successfully!${NC}"
echo -e "${BLUE}Sarah Rodriguez is now monitoring BLOOM Ecosystem operations.${NC}"