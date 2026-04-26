"""
test_pipeline.py
pytest integration tests for City Wallet backend.
Run: pytest backend/test_pipeline.py -v
Requires: uvicorn running on localhost:8000 OR uses httpx AsyncClient with ASGITransport.
"""

import json
import time
import pytest
import pytest_asyncio
import httpx
from httpx import AsyncClient, ASGITransport

# Import the app directly so we don't need a running server
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from main import app
from redemption import create_redemption_token, validate_token
from payone_simulator import get_merchant_load
from context_fsm import get_tod_bucket, evaluate_context


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client():
    """Async test client using ASGI transport (no running server needed)."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as c:
        yield c


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_context_endpoint(client: AsyncClient):
    """GET /context should return a valid context_state."""
    resp = await client.get("/context?demo=true")
    assert resp.status_code == 200
    data = resp.json()
    assert "context_state" in data
    assert data["context_state"] == "RAINY_QUIET_LUNCH"
    assert "signals" in data
    assert "intent" in data
    print(f"  context_state: {data['context_state']}")


@pytest.mark.asyncio
async def test_offer_generation(client: AsyncClient):
    """POST /offers/generate should return offer with headline and discount_pct."""
    session_id = "test-session-001"
    resp = await client.post("/offers/generate", json={
        "merchant_id": "cafe_muller",
        "session_id": session_id,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "offer_id" in data
    assert "headline" in data
    assert "discount_pct" in data
    assert isinstance(data["discount_pct"], int)
    assert 5 <= data["discount_pct"] <= 20
    print(f"  offer_id: {data['offer_id']}")
    print(f"  headline: {data['headline']}")
    print(f"  discount_pct: {data['discount_pct']}%")


@pytest.mark.asyncio
async def test_acceptance(client: AsyncClient):
    """POST /offers/{id}/accept should return a valid JWT token."""
    # First generate an offer
    gen_resp = await client.post("/offers/generate", json={
        "merchant_id": "cafe_muller",
        "session_id": "test-session-002",
    })
    assert gen_resp.status_code == 200
    offer_id = gen_resp.json()["offer_id"]

    # Accept it
    accept_resp = await client.post(f"/offers/{offer_id}/accept", json={
        "session_id": "test-session-002",
    })
    assert accept_resp.status_code == 200
    data = accept_resp.json()
    assert "token" in data
    assert "qr_data" in data
    assert len(data["token"]) > 10  # JWT is not empty

    # Validate the token locally
    payload = validate_token(data["token"])
    assert payload is not None
    assert payload["offer_id"] == offer_id
    print(f"  token valid: True")
    print(f"  offer_id in token: {payload['offer_id']}")


@pytest.mark.asyncio
async def test_redemption(client: AsyncClient):
    """POST /redeem/{token} should return success=True for a valid fresh token."""
    # Generate + accept
    gen_resp = await client.post("/offers/generate", json={
        "merchant_id": "bistro_central",
        "session_id": "test-session-003",
    })
    offer_id = gen_resp.json()["offer_id"]
    accept_resp = await client.post(f"/offers/{offer_id}/accept", json={
        "session_id": "test-session-003",
    })
    token = accept_resp.json()["token"]

    # Redeem
    redeem_resp = await client.post(f"/redeem/{token}")
    assert redeem_resp.status_code == 200
    data = redeem_resp.json()
    assert data["success"] is True
    assert "cashback_message" in data
    print(f"  cashback_message: {data['cashback_message']}")


@pytest.mark.asyncio
async def test_expired_token(client: AsyncClient):
    """POST /redeem with an expired JWT should return success=False."""
    # Create a token with 0-second expiry
    import jwt
    import os
    from datetime import datetime, timezone, timedelta

    secret = os.getenv("JWT_SECRET", "supersecret_dev_key_change_in_prod")
    expired_payload = {
        "offer_id": "fake-offer-expired",
        "merchant_id": "cafe_muller",
        "discount_pct": 10,
        "session_id": "test-expired",
        "iat": datetime.now(timezone.utc) - timedelta(seconds=120),
        "exp": datetime.now(timezone.utc) - timedelta(seconds=60),  # already expired
    }
    expired_token = jwt.encode(expired_payload, secret, algorithm="HS256")

    resp = await client.post(f"/redeem/{expired_token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    print(f"  expired token correctly rejected: success={data['success']}")


@pytest.mark.asyncio
async def test_ollama_connection():
    """Verify Ollama is reachable at localhost:11434."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.get("http://localhost:11434/api/tags")
            assert resp.status_code == 200
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            print(f"  Ollama reachable. Models available: {models}")
            assert len(models) > 0, "No models found in Ollama — run: ollama pull mistral"
    except httpx.ConnectError:
        pytest.skip("Ollama not running at localhost:11434 — start with: ollama serve")


@pytest.mark.asyncio
async def test_merchants_endpoint(client: AsyncClient):
    """GET /merchants should return 3 merchants."""
    resp = await client.get("/merchants")
    assert resp.status_code == 200
    data = resp.json()
    assert "merchants" in data
    assert len(data["merchants"]) == 3
    ids = [m["id"] for m in data["merchants"]]
    assert "cafe_muller" in ids
    print(f"  merchants: {ids}")


@pytest.mark.asyncio
async def test_dashboard_endpoint(client: AsyncClient):
    """GET /merchant/{id}/dashboard should return metric structure."""
    resp = await client.get("/merchant/cafe_muller/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_offers_generated" in data
    assert "accept_rate" in data
    assert isinstance(data["accept_rate"], float)
    print(f"  total_offers_generated: {data['total_offers_generated']}")
    print(f"  accept_rate: {data['accept_rate']}%")


# ── Unit tests (no HTTP) ──────────────────────────────────────────────────────

def test_payone_load_levels():
    """Verify PayOne simulator returns correct load labels."""
    assert get_merchant_load("cafe_muller", 8) == "high"    # morning rush
    assert get_merchant_load("cafe_muller", 12) == "low"    # quiet lunch
    assert get_merchant_load("bakery_hoffmann", 7) == "high"  # bakery morning
    assert get_merchant_load("bakery_hoffmann", 20) == "low"  # bakery evening


def test_tod_buckets():
    """Verify TOD bucket assignments."""
    assert get_tod_bucket(8) == "morning"
    assert get_tod_bucket(12) == "lunch"
    assert get_tod_bucket(15) == "afternoon"
    assert get_tod_bucket(19) == "evening"
    assert get_tod_bucket(23) == "night"
    assert get_tod_bucket(2) == "night"


def test_jwt_token_lifecycle():
    """Verify JWT create → validate round-trip."""
    token = create_redemption_token("offer-abc", "cafe_muller", 15, "session-xyz")
    payload = validate_token(token)
    assert payload is not None
    assert payload["offer_id"] == "offer-abc"
    assert payload["merchant_id"] == "cafe_muller"
    assert payload["discount_pct"] == 15
