"""
main.py
City Wallet — FastAPI backend.
All endpoints, CORS, SSE streaming, and startup logic.
"""

import asyncio
import json
import logging
import os
import random
import uuid
from datetime import datetime, timezone
from typing import Optional, AsyncGenerator

import httpx
import redis.asyncio as aioredis
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

load_dotenv()

from database import get_db, init_db, OfferEvent
from context_fsm import evaluate_context, get_tod_bucket, get_fsm
from offer_engine import generate_offer, classify_intent
from payone_simulator import get_merchant_load
from redemption import create_redemption_token, validate_token, mark_redeemed, is_redeemed

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
OPENWEATHER_KEY = os.getenv("OPENWEATHER_KEY", "")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
API_PUBLIC_BASE_URL = os.getenv("API_PUBLIC_BASE_URL", "http://localhost:8000")

# Stuttgart coordinates
STUTTGART_LAT = 48.78
STUTTGART_LON = 9.18

# ── Hardcoded merchants ────────────────────────────────────────────────────────
MERCHANTS = [
    {
        "id": "cafe_muller",
        "name": "Café Müller",
        "type": "cafe",
        "lat": 48.7784,
        "lon": 9.1800,
        "rule": "IF quiet_hours AND weather.cold THEN max_discount=15% AND tone=warm",
        "description": "Cosy neighbourhood café in Stuttgart Mitte",
    },
    {
        "id": "bistro_central",
        "name": "Bistro Central",
        "type": "restaurant",
        "lat": 48.7801,
        "lon": 9.1765,
        "rule": "IF evening AND payone_load.high THEN max_discount=10% AND tone=social",
        "description": "Lively bistro serving modern European cuisine",
    },
    {
        "id": "bakery_hoffmann",
        "name": "Bäckerei Hoffmann",
        "type": "bakery",
        "lat": 48.7756,
        "lon": 9.1820,
        "rule": "IF morning AND first_visit THEN max_discount=12% AND tone=comfort",
        "description": "Traditional Stuttgart bakery, fresh bread since 1962",
    },
    {
        "id": "chai_point_bengaluru",
        "name": "Chai Point Bengaluru",
        "type": "cafe",
        "lat": 12.9716,
        "lon": 77.5946,
        "rule": "IF rainy_evening THEN max_discount=14% AND tone=warm",
        "description": "India demo merchant in Bengaluru",
    },
   
 


]

MERCHANT_MAP = {m["id"]: m for m in MERCHANTS}

# ── Redis async client ─────────────────────────────────────────────────────────
_redis: Optional[aioredis.Redis] = None
_redeem_code_cache: dict[str, str] = {}


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis


async def _create_redemption_code(token: str) -> Optional[str]:
    """Create a short code -> token mapping in Redis for scanner-friendly QR payloads."""
    code = uuid.uuid4().hex[:10]
    # Keep local fallback mapping for demo reliability across reloads.
    _redeem_code_cache[code] = token

    try:
        r = await get_redis()
        # Keep mapping alive in Redis for 10 mins.
        await r.set(f"redeem_code:{code}", token, ex=600)
    except Exception as e:
        logger.warning(f"Redis set failed for code {code}: {e}")

    return code


async def _resolve_redemption_code(code: str) -> Optional[str]:
    """Resolve a short code back to a full JWT token."""
    try:
        r = await get_redis()
        token = await r.get(f"redeem_code:{code}")
        if token:
            return token
    except Exception as e:
        logger.warning(f"Redis get failed for code {code}: {e}")

    # Fallback to local process cache.
    token = _redeem_code_cache.get(code)
    if token:
        logger.info(f"Resolved code {code} via local cache fallback")
    return token


# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="City Wallet API",
    version="1.0.0",
    description="Generative, context-aware local offer system for Stuttgart",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "City Wallet API is active",
        "instructions": "Point your QR scanner to /redeem/code/{code}"
    }


@app.on_event("startup")
async def startup():
    await init_db()
    logger.info("City Wallet API started — DB initialised")


# ── Pydantic models ────────────────────────────────────────────────────────────

class GenerateOfferRequest(BaseModel):
    merchant_id: str
    session_id: str
    client_intent: Optional[dict] = None


class AcceptOfferRequest(BaseModel):
    session_id: str


# ── Weather helper ─────────────────────────────────────────────────────────────

async def fetch_weather(lat: float = STUTTGART_LAT, lon: float = STUTTGART_LON) -> dict:
    """Fetch current weather from OpenWeatherMap. Returns safe fallback on error."""
    if not OPENWEATHER_KEY or OPENWEATHER_KEY == "your_key_here":
        logger.warning("No OpenWeatherMap key — using simulated weather")
        return {"condition": "clouds", "description": "Overcast clouds", "temp_c": 12.0}

    url = (
        f"https://api.openweathermap.org/data/2.5/weather"
        f"?lat={lat}&lon={lon}&appid={OPENWEATHER_KEY}&units=metric"
    )
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            weather_main = data["weather"][0]["main"].lower()
            weather_desc = data["weather"][0]["description"]
            temp = data["main"]["temp"]
            return {"condition": weather_main, "description": weather_desc, "temp_c": temp}
    except Exception as e:
        logger.warning(f"Weather fetch failed: {e} — using fallback")
        return {"condition": "clouds", "description": "Overcast clouds", "temp_c": 12.0}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/context", summary="Get current city context state")
async def get_context(
    demo: bool = Query(False, description="Force RAINY_QUIET_LUNCH demo state"),
    lat: float = Query(STUTTGART_LAT, description="Latitude for weather lookup"),
    lon: float = Query(STUTTGART_LON, description="Longitude for weather lookup"),
):
    """
    Returns the full city context payload:
    weather + TOD + PayOne load + Ollama intent + FSM state.

    Use ?demo=true for hackathon demo (forces RAINY_QUIET_LUNCH + cafe_muller).
    """
    if demo:
        intent = {
            "intent": "warm_drink",
            "urgency": "high",
            "confidence": 0.95,
        }
        fsm = get_fsm()
        fsm.evaluate_context("rain", "lunch", "low")
        return {
            "context_state": "RAINY_QUIET_LUNCH",
            "offer_archetype": "warm_drink",
            "emotional_frame": "warm",
            "signals": {
                "weather_condition": "rain",
                "tod_bucket": "lunch",
                "payone_load": "low",
                "merchant_id": "cafe_muller",
            },
            "intent": intent,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "demo_mode": True,
        }

    # Real context
    weather = await fetch_weather(lat, lon)
    now = datetime.now()
    tod_bucket = get_tod_bucket(now.hour)
    payone_load = get_merchant_load(random.choice(list(MERCHANT_MAP.keys())), now.hour)

    # Classify intent via Ollama
    intent = await classify_intent({
        "weather": weather["condition"],
        "tod": tod_bucket,
        "movement_speed": "slow",
        "dwell_time_seconds": random.randint(30, 180),
    })

    # Evaluate FSM state
    context_state = evaluate_context(weather["condition"], tod_bucket, payone_load)

    fsm = get_fsm()
    return fsm.get_context_payload(
        weather_condition=weather["condition"],
        tod_bucket=tod_bucket,
        payone_load=payone_load,
        intent=intent,
    )


@app.get("/merchants", summary="List all sample merchants")
async def list_merchants():
    """Returns all 3 hardcoded Stuttgart merchants."""
    return {"merchants": MERCHANTS}


@app.post("/offers/generate", summary="Generate a personalized offer")
async def generate_offer_endpoint(
    body: GenerateOfferRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generates an Ollama-powered offer for a merchant given current context.
    Stores the offer in SQLite and publishes to Redis pub/sub for SSE.
    """
    merchant = MERCHANT_MAP.get(body.merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail=f"Merchant '{body.merchant_id}' not found")

    # Get context
    # Fetch weather near the selected merchant (supports non-Stuttgart demos too).
    weather = await fetch_weather(
        float(merchant.get("lat", STUTTGART_LAT)),
        float(merchant.get("lon", STUTTGART_LON)),
    )
    now = datetime.now()
    tod_bucket = get_tod_bucket(now.hour)
    payone_load = get_merchant_load(body.merchant_id, now.hour)
    context_state = evaluate_context(weather["condition"], tod_bucket, payone_load)

    # Get FSM archetype
    fsm = get_fsm()
    state_def = fsm.get_state_def(context_state) or {}
    offer_archetype = state_def.get("offer_archetype", "general")

    # Prefer on-device intent (privacy-preserving) when provided by the mobile app.
    if body.client_intent and isinstance(body.client_intent, dict):
        intent = {
            "intent": body.client_intent.get("intent", "browse"),
            "urgency": body.client_intent.get("urgency", "low"),
            "confidence": float(body.client_intent.get("confidence", 0.5)),
            "source": "on_device",
        }
        logger.info(f"Using on-device intent for session {body.session_id}: {intent['intent']}")
    else:
        intent = await classify_intent({
            "weather": weather["condition"],
            "tod": tod_bucket,
            "movement_speed": "slow",
            "dwell_time_seconds": 60,
        })
        intent["source"] = "server"
    intent_token = intent.get("intent", "browse")

    # Generate offer via Ollama
    offer = await generate_offer(context_state, merchant, intent_token, offer_archetype)

    # Persist to DB
    offer_id = str(uuid.uuid4())
    event = OfferEvent(
        id=offer_id,
        merchant_id=body.merchant_id,
        session_id=body.session_id,
        context_state=context_state,
        offer_archetype=offer_archetype,
        headline=offer.get("headline"),
        sub_copy=offer.get("sub_copy"),
        discount_pct=offer.get("discount_pct"),
        discount_label=offer.get("discount_label"),
        emotional_frame=offer.get("emotional_frame"),
        expiry_minutes=offer.get("expiry_minutes"),
        category_keyword=offer.get("category_keyword"),
        cta_text=offer.get("cta_text"),
        status="generated",
    )
    db.add(event)
    await db.commit()

    # Publish to Redis pub/sub for SSE streaming
    try:
        r = await get_redis()
        offer_payload = {**offer, "offer_id": offer_id, "merchant": merchant}
        await r.publish(f"session:{body.session_id}", json.dumps(offer_payload))
    except Exception as e:
        logger.warning(f"Redis publish failed: {e}")

    return {
        **offer,
        "offer_id": offer_id,
        "context_state": context_state,
        "merchant": merchant,
        "intent": intent,
    }


@app.get("/offers/{offer_id}", summary="Get a stored offer by ID")
async def get_offer(
    offer_id: str = Path(..., description="Offer UUID"),
    db: AsyncSession = Depends(get_db),
):
    """Returns a previously generated offer from SQLite."""
    result = await db.execute(select(OfferEvent).where(OfferEvent.id == offer_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Offer not found")
    return {
        "offer_id": event.id,
        "merchant_id": event.merchant_id,
        "session_id": event.session_id,
        "context_state": event.context_state,
        "headline": event.headline,
        "sub_copy": event.sub_copy,
        "discount_pct": event.discount_pct,
        "discount_label": event.discount_label,
        "emotional_frame": event.emotional_frame,
        "expiry_minutes": event.expiry_minutes,
        "category_keyword": event.category_keyword,
        "cta_text": event.cta_text,
        "status": event.status,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


@app.post("/offers/{offer_id}/accept", summary="Accept an offer and get redemption QR")
async def accept_offer(
    offer_id: str = Path(..., description="Offer UUID"),
    body: AcceptOfferRequest = ...,
    db: AsyncSession = Depends(get_db),
):
    """
    Accepts an offer, generates a signed JWT redemption token,
    and returns QR data for display in the mobile app.
    """
    result = await db.execute(select(OfferEvent).where(OfferEvent.id == offer_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Offer not found")
    if event.status == "redeemed":
        raise HTTPException(status_code=409, detail="Offer already redeemed")

    token = create_redemption_token(
        offer_id=offer_id,
        merchant_id=event.merchant_id,
        discount_pct=event.discount_pct or 10,
        user_session_id=body.session_id,
    )

    # Update DB
    await db.execute(
        update(OfferEvent)
        .where(OfferEvent.id == offer_id)
        .values(
            status="accepted",
            accepted_at=datetime.utcnow(),
            redemption_token=token,
        )
    )
    await db.commit()

    merchant = MERCHANT_MAP.get(event.merchant_id, {})

    # Use a short scanner-friendly URL whenever possible.
    code = await _create_redemption_code(token)
    qr_data = f"{API_PUBLIC_BASE_URL.rstrip('/')}/redeem/code/{code}"
    
    logger.info(f"🚀 GENERATED QR URL: {qr_data}")

    return {
        "offer_id": offer_id,
        "token": token,
        "qr_data": qr_data,
        "merchant_name": merchant.get("name", ""),
        "discount_label": event.discount_label,
        "expiry_seconds": 60,
    }


async def _redeem_token_impl(token: str, db: AsyncSession) -> dict:
    """
    Validates JWT token, marks offer as redeemed in Redis + SQLite.
    Used by merchant's point-of-sale scanner.
    """
    payload = validate_token(token)
    if not payload:
        return {"success": False, "error": "Token expired or invalid"}

    offer_id = payload.get("offer_id")
    merchant_id = payload.get("merchant_id")

    if is_redeemed(offer_id):
        return {"success": False, "error": "Offer already redeemed"}

    mark_redeemed(offer_id)

    await db.execute(
        update(OfferEvent)
        .where(OfferEvent.id == offer_id)
        .values(status="redeemed", redeemed_at=datetime.utcnow())
    )
    await db.commit()

    merchant = MERCHANT_MAP.get(merchant_id, {})
    result = await db.execute(select(OfferEvent).where(OfferEvent.id == offer_id))
    event = result.scalar_one_or_none()

    return {
        "success": True,
        "merchant_name": merchant.get("name", ""),
        "discount_label": event.discount_label if event else "",
        "cashback_message": f"🎉 Cashback applied! {event.discount_label if event else 'Discount confirmed'} — enjoy your visit!",
    }


@app.post("/redeem/{token}", summary="Redeem a QR token at the merchant")
async def redeem_token(
    token: str = Path(..., description="JWT redemption token"),
    db: AsyncSession = Depends(get_db),
):
    return await _redeem_token_impl(token, db)


@app.get("/redeem/{token}", summary="Redeem a QR token via URL scan")
async def redeem_token_get(
    token: str = Path(..., description="JWT redemption token"),
    db: AsyncSession = Depends(get_db),
):
    # QR scanners and browser deep links usually perform GET requests.
    return await _redeem_token_impl(token, db)


@app.get("/redeem/code/{code}", summary="Redeem using short scanner code")
async def redeem_by_code_get(
    code: str = Path(..., description="Short redemption code"),
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import HTMLResponse
    logger.info(f"QR Scan received for code: {code}")
    
    token = await _resolve_redemption_code(code)
    if not token:
        logger.warning(f"Redemption failed: Code {code} not found or expired")
        return HTMLResponse(content="<h1>❌ Something went wrong</h1><p>Code expired or invalid. Please generate a new offer.</p>", status_code=400)
    
    result = await _redeem_token_impl(token, db)
    if result["success"]:
        return HTMLResponse(content=f"""
            <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0F0F1A; color: white; height: 100vh;">
                <h1 style="font-size: 72px;">✅</h1>
                <h1 style="color: #6C63FF;">Success!</h1>
                <h2>{result['merchant_name']}</h2>
                <p style="font-size: 18px;">{result['cashback_message']}</p>
                <br/>
                <p style="color: #8B8FA8;">You can close this window now.</p>
            </div>
        """)
    else:
        return HTMLResponse(content=f"<h1>❌ Redemption Failed</h1><p>{result.get('error', 'Unknown error')}</p>", status_code=400)


@app.post("/redeem/code/{code}", summary="Redeem using short scanner code")
async def redeem_by_code_post(
    code: str = Path(..., description="Short redemption code"),
    db: AsyncSession = Depends(get_db),
):
    token = await _resolve_redemption_code(code)
    if not token:
        return {"success": False, "error": "Code expired or invalid"}
    return await _redeem_token_impl(token, db)


@app.get("/merchant/{merchant_id}/dashboard", summary="Merchant analytics dashboard data")
async def merchant_dashboard(
    merchant_id: str = Path(..., description="Merchant ID"),
    db: AsyncSession = Depends(get_db),
):
    """Returns offer funnel metrics and recent events for the merchant dashboard."""
    merchant = MERCHANT_MAP.get(merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    total_q = await db.execute(
        select(func.count()).where(OfferEvent.merchant_id == merchant_id)
    )
    total_generated = total_q.scalar() or 0

    accepted_q = await db.execute(
        select(func.count()).where(
            OfferEvent.merchant_id == merchant_id,
            OfferEvent.status.in_(["accepted", "redeemed"]),
        )
    )
    total_accepted = accepted_q.scalar() or 0

    redeemed_q = await db.execute(
        select(func.count()).where(
            OfferEvent.merchant_id == merchant_id,
            OfferEvent.status == "redeemed",
        )
    )
    total_redeemed = redeemed_q.scalar() or 0

    accept_rate = round((total_accepted / total_generated * 100), 1) if total_generated > 0 else 0.0

    # Top context states
    states_q = await db.execute(
        select(OfferEvent.context_state, func.count().label("count"))
        .where(OfferEvent.merchant_id == merchant_id)
        .group_by(OfferEvent.context_state)
        .order_by(func.count().desc())
        .limit(5)
    )
    top_states = [{"state": row.context_state, "count": row.count} for row in states_q]

    # Recent events
    recent_q = await db.execute(
        select(OfferEvent)
        .where(OfferEvent.merchant_id == merchant_id)
        .order_by(OfferEvent.created_at.desc())
        .limit(20)
    )
    recent_events = [
        {
            "offer_id": e.id,
            "timestamp": e.created_at.isoformat() if e.created_at else None,
            "context_state": e.context_state,
            "headline": e.headline,
            "discount_pct": e.discount_pct,
            "status": e.status,
        }
        for e in recent_q.scalars().all()
    ]

    return {
        "merchant_id": merchant_id,
        "merchant_name": merchant.get("name"),
        "total_offers_generated": total_generated,
        "total_accepted": total_accepted,
        "total_redeemed": total_redeemed,
        "accept_rate": accept_rate,
        "top_context_states": top_states,
        "recent_events": recent_events,
    }


@app.get("/offers/stream/{session_id}", summary="SSE stream for real-time offer delivery")
async def offers_stream(
    session_id: str = Path(..., description="User session ID"),
):
    """
    Server-Sent Events endpoint.
    The mobile app subscribes here; when POST /offers/generate publishes to Redis,
    this endpoint forwards the event to the client in real-time.
    """
    async def event_generator() -> AsyncGenerator[dict, None]:
        try:
            r = await get_redis()
            pubsub = r.pubsub()
            await pubsub.subscribe(f"session:{session_id}")
            logger.info(f"SSE client connected for session {session_id}")

            # Send initial heartbeat
            yield {"event": "connected", "data": json.dumps({"session_id": session_id})}

            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield {"event": "offer", "data": message["data"]}
                # Heartbeat every ~30s via timeout would need a real implementation;
                # this listens indefinitely until client disconnects
        except asyncio.CancelledError:
            logger.info(f"SSE client disconnected: {session_id}")
        except Exception as e:
            logger.error(f"SSE error for session {session_id}: {e}")
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())


# ── Health check ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "city-wallet-api", "version": "1.0.0"}
