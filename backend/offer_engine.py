"""
offer_engine.py
Core generative offer engine — calls Ollama (Mistral) locally via httpx.
"""

import json
import logging
import os
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")

OFFER_PROMPT_TEMPLATE = """\
You are a hyper-local offer engine for a city wallet app. 
Given the context below, generate a dynamic, personalized offer for this merchant.
Return ONLY valid JSON, no markdown, no explanation.

Context state: {context_state}
Merchant name: {merchant_name}
Merchant type: {merchant_type}
Merchant rule: {merchant_rule}
User intent: {intent_token}
City: Stuttgart, Germany

Return this exact JSON structure:
{{
  "headline": "short punchy headline max 8 words",
  "sub_copy": "one sentence emotional framing max 15 words",
  "discount_pct": integer between 5 and 20,
  "discount_label": "e.g. 15% off your next coffee",
  "emotional_frame": "warm|social|comfort|factual",
  "expiry_minutes": integer between 20 and 90,
  "category_keyword": "coffee|food|bakery|drinks|dining",
  "cta_text": "short call to action max 4 words"
}}"""

INTENT_PROMPT_TEMPLATE = """\
You are a context classification engine for a city wallet app.
Given the user signals below, classify the user's current intent.
Return ONLY valid JSON, no markdown, no explanation.

Signals:
- weather: {weather}
- time_of_day: {tod}
- movement_speed: {movement_speed}
- dwell_time_seconds: {dwell_time_seconds}

Return this exact JSON structure:
{{
  "intent": "warm_drink|hot_food|browse|commute|dining",
  "urgency": "low|medium|high",
  "confidence": float between 0.0 and 1.0
}}"""

# ── Fallback offers per archetype ─────────────────────────────────────────────

FALLBACK_OFFERS = {
    "warm_drink": {
        "headline": "Warm up with a cosy coffee",
        "sub_copy": "Perfect for a rainy afternoon in Stuttgart.",
        "discount_pct": 10,
        "discount_label": "10% off your next coffee",
        "emotional_frame": "warm",
        "expiry_minutes": 30,
        "category_keyword": "coffee",
        "cta_text": "Get warm now",
    },
    "hot_food": {
        "headline": "Start the day right",
        "sub_copy": "Fresh hot breakfast waiting for you nearby.",
        "discount_pct": 12,
        "discount_label": "12% off your breakfast",
        "emotional_frame": "comfort",
        "expiry_minutes": 45,
        "category_keyword": "food",
        "cta_text": "Grab it now",
    },
    "dining": {
        "headline": "Evening dining made special",
        "sub_copy": "Join the buzz — great food, great company.",
        "discount_pct": 15,
        "discount_label": "15% off your evening meal",
        "emotional_frame": "social",
        "expiry_minutes": 60,
        "category_keyword": "dining",
        "cta_text": "Reserve your spot",
    },
    "general": {
        "headline": "Exclusive local offer for you",
        "sub_copy": "Discover the best deals in Stuttgart today.",
        "discount_pct": 8,
        "discount_label": "8% off your purchase",
        "emotional_frame": "factual",
        "expiry_minutes": 30,
        "category_keyword": "food",
        "cta_text": "Claim offer",
    },
}

FALLBACK_INTENT = {
    "intent": "browse",
    "urgency": "low",
    "confidence": 0.5,
}


def _extract_json_from_text(text: str) -> Optional[dict]:
    """
    Extract the first JSON object from a text string.
    Handles cases where Ollama wraps output in markdown fences.
    """
    # Strip markdown code fences
    text = re.sub(r"```(?:json)?", "", text).strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find a JSON object via regex
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return None


async def _call_ollama(prompt: str, timeout: float = 120.0) -> Optional[str]:
    """Send a prompt to Ollama and return the raw response text."""
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("response", "")
    except httpx.ConnectError:
        logger.error(f"Cannot connect to Ollama at {OLLAMA_URL}")
        return None
    except Exception as e:
        logger.error(f"Ollama call failed: {e}")
        return None


async def generate_offer(
    context_state: str,
    merchant: dict,
    intent_token: str,
    offer_archetype: str = "general",
) -> dict:
    """
    Generate a personalized offer for a merchant using Ollama/Mistral.

    Args:
        context_state: FSM state name (e.g. "RAINY_QUIET_LUNCH")
        merchant: Merchant dict with name, type, rule fields
        intent_token: User intent string (e.g. "warm_drink")
        offer_archetype: Fallback archetype key if generation fails

    Returns:
        Offer dict with all required fields.
    """
    prompt = OFFER_PROMPT_TEMPLATE.format(
        context_state=context_state,
        merchant_name=merchant.get("name", "Local Merchant"),
        merchant_type=merchant.get("type", "cafe"),
        merchant_rule=merchant.get("rule", "standard offers apply"),
        intent_token=intent_token,
    )

    raw = await _call_ollama(prompt)
    if raw:
        parsed = _extract_json_from_text(raw)
        if parsed and "headline" in parsed and "discount_pct" in parsed:
            # Ensure all required keys exist
            parsed.setdefault("sub_copy", "")
            parsed.setdefault("discount_label", f"{parsed['discount_pct']}% off")
            parsed.setdefault("emotional_frame", "factual")
            parsed.setdefault("expiry_minutes", 30)
            parsed.setdefault("category_keyword", "food")
            parsed.setdefault("cta_text", "Claim offer")
            # Clamp discount
            parsed["discount_pct"] = max(5, min(20, int(parsed.get("discount_pct", 10))))
            logger.info(f"Offer generated via Ollama for {merchant.get('id', '?')}")
            return parsed

    logger.warning("Ollama generation failed or returned invalid JSON — using fallback")
    return FALLBACK_OFFERS.get(offer_archetype, FALLBACK_OFFERS["general"]).copy()


async def classify_intent(signals: dict) -> dict:
    """
    Classify user intent from context signals using Ollama.

    Args:
        signals: Dict with weather, tod, movement_speed, dwell_time_seconds

    Returns:
        {"intent": str, "urgency": str, "confidence": float}
    """
    prompt = INTENT_PROMPT_TEMPLATE.format(
        weather=signals.get("weather", "unknown"),
        tod=signals.get("tod", "unknown"),
        movement_speed=signals.get("movement_speed", "slow"),
        dwell_time_seconds=signals.get("dwell_time_seconds", 60),
    )

    raw = await _call_ollama(prompt, timeout=60.0)
    if raw:
        parsed = _extract_json_from_text(raw)
        if parsed and "intent" in parsed:
            parsed.setdefault("urgency", "low")
            parsed.setdefault("confidence", 0.7)
            try:
                parsed["confidence"] = float(parsed["confidence"])
            except (ValueError, TypeError):
                parsed["confidence"] = 0.7
            return parsed

    return FALLBACK_INTENT.copy()
