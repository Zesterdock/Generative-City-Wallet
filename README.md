# 🏙️ City Wallet — Generative Local Offer System

> **Hackathon project** — Context-aware, AI-generated hyper-local offers for Stuttgart, Germany.  
> Powered by Ollama (Mistral 7B), FastAPI, React Native (Expo), and Next.js 14.

---

## 📋 Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.11+ | Required for backend |
| Node.js | 20+ | Required for mobile + dashboard |
| Docker Desktop | Latest | For Redis |
| Expo CLI | Latest | `npm install -g expo-cli` |
| Ollama | Latest | [ollama.ai](https://ollama.ai) |

**Pull the Mistral model before starting:**
```bash
ollama pull mistral
ollama serve   # Start Ollama on localhost:11434
```

---

## 🚀 Quick Start

### Option A — One-command (Linux/Mac/WSL)
```bash
bash run_demo.sh
```

### Option B — Manual (Windows PowerShell)

**1. Start Redis:**
```powershell
docker compose up -d redis
```

**2. Install Python deps + start backend:**
```powershell
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**3. Start mobile app (new terminal):**
```powershell
cd mobile
npm install
npx expo start
```

**4. Start merchant dashboard (new terminal):**
```powershell
cd merchant-dashboard
npm install
npm run dev
```

---

## 🌐 Service URLs

| Service | URL |
|---------|-----|
| FastAPI Backend | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Demo Context | http://localhost:8000/context?demo=true |
| Merchant Dashboard | http://localhost:3001 |
| Redis | localhost:6379 |
| Ollama | http://localhost:11434 |

---

## 🎭 Demo Scenario

The system has a reliable **demo mode** that bypasses real weather:

```bash
# Returns RAINY_QUIET_LUNCH context (warm drink archetype, cafe_muller)
curl "http://localhost:8000/context?demo=true"
```

**Full demo flow via curl:**

```bash
# Step 1 — Get context
curl "http://localhost:8000/context?demo=true" | python -m json.tool

# Step 2 — Generate AI offer
curl -X POST "http://localhost:8000/offers/generate" \
  -H "Content-Type: application/json" \
  -d '{"merchant_id": "cafe_muller", "session_id": "demo-hackathon-01"}' \
  | python -m json.tool

# Step 3 — Accept offer (copy offer_id from previous response)
curl -X POST "http://localhost:8000/offers/{OFFER_ID}/accept" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "demo-hackathon-01"}' \
  | python -m json.tool

# Step 4 — Redeem (copy token from previous response)
curl -X POST "http://localhost:8000/redeem/{TOKEN}" | python -m json.tool

# Step 5 — Merchant dashboard data
curl "http://localhost:8000/merchant/cafe_muller/dashboard" | python -m json.tool
```

---

## 🧪 Running Tests

```bash
cd backend
pytest test_pipeline.py -v
```

**Test coverage:**
- ✅ `test_context_endpoint` — GET /context returns valid state
- ✅ `test_offer_generation` — POST /offers/generate returns valid offer
- ✅ `test_acceptance` — Accept returns valid JWT token
- ✅ `test_redemption` — Redeem returns success=True
- ✅ `test_expired_token` — Expired JWT returns success=False
- ✅ `test_ollama_connection` — Ollama reachable at localhost:11434
- ✅ `test_merchants_endpoint` — 3 merchants returned
- ✅ `test_dashboard_endpoint` — Dashboard metrics returned
- ✅ `test_payone_load_levels` — Load simulator unit test
- ✅ `test_tod_buckets` — Time-of-day bucket unit test
- ✅ `test_jwt_token_lifecycle` — JWT create/validate round-trip

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CITY WALLET                             │
├──────────────┬──────────────────┬───────────────────────────────┤
│   Mobile App │ Merchant Dashbrd │           Backend             │
│  (Expo/RN)   │   (Next.js 14)   │         (FastAPI)             │
│              │                  │                               │
│ ┌──────────┐ │ ┌──────────────┐ │ ┌──────────────────────────┐ │
│ │Consent   │ │ │  Analytics   │ │ │  GET /context            │ │
│ │Screen    │ │ │  Dashboard   │ │ │  POST /offers/generate   │ │
│ └──────────┘ │ └──────────────┘ │ │  POST /offers/{id}/accept│ │
│ ┌──────────┐ │ ┌──────────────┐ │ │  POST /redeem/{token}    │ │
│ │Home Feed │ │ │  Rule Editor │ │ │  GET /merchant/{id}/dash │ │
│ │OfferCard │ │ │  (DSL gen)   │ │ │  GET /offers/stream (SSE)│ │
│ └──────────┘ │ └──────────────┘ │ └──────────────────────────┘ │
│ ┌──────────┐ │                  │ ┌──────────────────────────┐ │
│ │QR Screen │ │                  │ │  Context FSM             │ │
│ │60s timer │ │                  │ │  (transitions library)   │ │
│ └──────────┘ │                  │ └──────────────────────────┘ │
└──────────────┴──────────────────┴───────────────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────┐
              │                           │                       │
     ┌────────▼────────┐    ┌─────────────▼──────┐  ┌───────────▼────┐
     │  Ollama/Mistral │    │  SQLite             │  │  Redis         │
     │  localhost:11434│    │  city_wallet.db     │  │  localhost:6379│
     │  (no paid API)  │    │  offer_events table │  │  pub/sub + TTL │
     └─────────────────┘    └────────────────────┘  └────────────────┘
              │
     ┌────────▼────────┐    ┌─────────────────────┐
     │ OpenWeatherMap  │    │  PayOne Simulator    │
     │ (free tier)     │    │  (mock load curves)  │
     └─────────────────┘    └─────────────────────┘
```

### Data Flow
1. **Location** — Stays on device; only `intent_token` (e.g. "warm_drink") sent to API
2. **Context** — Weather + TOD + PayOne load → FSM evaluates → context state
3. **Intent** — Ollama classifies movement signals → intent + urgency + confidence
4. **Offer** — Ollama generates JSON offer → stored in SQLite → published to Redis
5. **SSE** — Mobile app subscribes to session channel → real-time offer delivery
6. **QR** — JWT token signed with 60s expiry → scanned at merchant → Redis marks redeemed

---

## 🔐 GDPR & Privacy

| Data | Where it stays | What leaves device |
|------|---------------|-------------------|
| GPS coordinates | On device only | ❌ Never sent |
| Movement speed | On device only | ❌ Never sent |
| Dwell time | On device only | ❌ Never sent |
| User name / PII | On device only | ❌ Never sent |
| Intent token | → Server | ✅ "warm_drink", "browse" etc. |
| Anonymous session ID | → Server | ✅ Random UUID, rotates daily |
| Weather context | From OWM API | ✅ Used for context only |

All offer data auto-expires after **24 hours** (Redis TTL + SQLite cleanup).  
No user tracking. No ad profiles. No third-party analytics.

---

## 📁 Project Structure

```
OFFER-GENERATOR/
├── docker-compose.yml          # Redis + Postgres services
├── run_demo.sh                 # One-command demo launcher
├── README.md                   # This file
│
├── backend/
│   ├── .env                    # API keys + config
│   ├── requirements.txt        # Python dependencies
│   ├── city_config.yaml        # FSM state definitions
│   ├── main.py                 # FastAPI app + all endpoints
│   ├── context_fsm.py          # Finite State Machine (transitions)
│   ├── offer_engine.py         # Ollama/Mistral offer generator
│   ├── payone_simulator.py     # PayOne load simulation
│   ├── redemption.py           # JWT tokens + Redis redemption
│   ├── database.py             # SQLAlchemy async + SQLite
│   └── test_pipeline.py        # pytest integration + unit tests
│
├── mobile/
│   ├── App.tsx                 # Root app + GDPR gate
│   ├── app.json                # Expo config
│   ├── package.json            # Mobile dependencies
│   └── src/
│       ├── api.ts              # Typed Axios API client
│       ├── components/
│       │   └── OfferCard.tsx   # Animated 3-second offer card
│       └── screens/
│           ├── ConsentScreen.tsx    # GDPR consent gate
│           ├── HomeScreen.tsx       # Main offer feed
│           └── RedemptionScreen.tsx # QR code + 60s countdown
│
└── merchant-dashboard/
    ├── package.json            # Next.js 14 dependencies
    ├── next.config.js          # API proxy config
    ├── styles/globals.css      # Design system + theme
    └── pages/
        ├── _app.tsx            # App wrapper
        ├── index.tsx           # Analytics dashboard
        └── rules.tsx           # Offer rule editor
```

---

## 🔑 Environment Variables

Copy `backend/.env` and fill in your OpenWeatherMap key:

```env
OPENWEATHER_KEY=your_free_key_from_openweathermap.org
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral
JWT_SECRET=supersecret_dev_key_change_in_prod
REDIS_URL=redis://localhost:6379
```

> The system works without a weather key — it falls back to simulated weather.

### On-device SLM intent (mobile)

The mobile app now infers user intent on-device and sends only an abstract intent token to backend:

```json
{
  "intent": "warm_drink|hot_food|browse|commute|dining",
  "urgency": "low|medium|high",
  "confidence": 0.0
}
```

To connect a real local runtime (Phi-3/Gemma wrapper), set in `mobile/app.json`:

```json
"extra": {
  "ON_DEVICE_SLM_ENDPOINT": "http://127.0.0.1:8080/infer"
}
```

If not set, the app uses a reliable on-device fallback policy in `mobile/src/onDeviceSlm.ts`.

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|---------|
| `ollama: command not found` | Install from https://ollama.ai |
| `mistral` model not found | Run `ollama pull mistral` |
| Redis connection refused | Run `docker compose up -d redis` |
| Port 8000 in use | Change uvicorn port: `--port 8001` |
| Expo not connecting to API | Update `API_BASE_URL` in `mobile/app.json` to your machine's IP |
| CORS errors | Backend has CORS `*` enabled for dev — should not occur |
