import asyncio
import os
import json
from dotenv import load_dotenv

# Load env vars (OLLAMA_URL, OLLAMA_MODEL)
load_dotenv()

from offer_engine import generate_offer, classify_intent

async def test_slm():
    print("--- Testing SLM Integration ---")
    
    # 1. Test Intent Classification
    print("\n[1] Testing Intent Classification...")
    signals = {
        "weather": "rain",
        "tod": "lunch",
        "movement_speed": "slow",
        "dwell_time_seconds": 120
    }
    intent_result = await classify_intent(signals)
    print(f"Signals: {signals}")
    print(f"Result: {json.dumps(intent_result, indent=2)}")
    
    # 2. Test Offer Generation
    print("\n[2] Testing Offer Generation...")
    merchant = {
        "id": "cafe_muller",
        "name": "Café Müller",
        "type": "cafe",
        "rule": "IF quiet_hours AND weather.cold THEN max_discount=15% AND tone=warm"
    }
    context_state = "RAINY_QUIET_LUNCH"
    intent_token = intent_result.get("intent", "warm_drink")
    
    offer_result = await generate_offer(
        context_state=context_state,
        merchant=merchant,
        intent_token=intent_token
    )
    print(f"Merchant: {merchant['name']}")
    print(f"Context: {context_state}")
    print(f"Intent: {intent_token}")
    print(f"Result: {json.dumps(offer_result, indent=2)}")

if __name__ == "__main__":
    asyncio.run(test_slm())
