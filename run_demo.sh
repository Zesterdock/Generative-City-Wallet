#!/bin/bash
# run_demo.sh — City Wallet one-command demo launcher
# Usage: bash run_demo.sh

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       🏙️  CITY WALLET  DEMO LAUNCHER      ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Start Docker (Redis) ─────────────────────────────────────────────
echo -e "${YELLOW}[1/4] Starting Redis via Docker Compose...${NC}"
docker compose up -d redis
echo -e "${GREEN}  ✓ Redis started on localhost:6379${NC}"
sleep 2

# ── Step 2: Install Python deps ───────────────────────────────────────────────
echo -e "${YELLOW}[2/4] Installing Python dependencies...${NC}"
cd backend
pip install -r requirements.txt -q
echo -e "${GREEN}  ✓ Python deps installed${NC}"

# ── Step 3: Start FastAPI backend ─────────────────────────────────────────────
echo -e "${YELLOW}[3/4] Starting FastAPI backend on port 8000...${NC}"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo -e "${GREEN}  ✓ FastAPI running (PID: $BACKEND_PID)${NC}"
sleep 3
cd ..

# ── Step 4: Print frontend instructions ───────────────────────────────────────
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           CITY WALLET IS RUNNING          ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Backend API:${NC}        http://localhost:8000"
echo -e "  ${CYAN}API Docs:${NC}           http://localhost:8000/docs"
echo -e "  ${CYAN}Demo context:${NC}       http://localhost:8000/context?demo=true"
echo -e "  ${CYAN}Health check:${NC}       http://localhost:8000/health"
echo ""
echo -e "${YELLOW}[START MOBILE] In a new terminal:${NC}"
echo "  cd mobile && npm install && npx expo start"
echo ""
echo -e "${YELLOW}[START DASHBOARD] In a new terminal:${NC}"
echo "  cd merchant-dashboard && npm install && npm run dev"
echo -e "  Then open: ${CYAN}http://localhost:3001${NC}"
echo ""
echo -e "${YELLOW}[RUN TESTS] In a new terminal:${NC}"
echo "  cd backend && pytest test_pipeline.py -v"
echo ""
echo -e "${YELLOW}[QUICK DEMO API CALLS]:${NC}"
echo "  # 1. Get context"
echo "  curl http://localhost:8000/context?demo=true | python -m json.tool"
echo ""
echo "  # 2. Generate offer"
echo "  curl -X POST http://localhost:8000/offers/generate \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"merchant_id\": \"cafe_muller\", \"session_id\": \"demo-001\"}' \\"
echo "    | python -m json.tool"
echo ""
echo -e "${RED}Press Ctrl+C to stop the backend${NC}"
echo ""

wait $BACKEND_PID
