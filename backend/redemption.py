"""
redemption.py
Handles JWT-based offer redemption tokens and Redis tracking.
"""

import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
import redis

logger = logging.getLogger(__name__)

JWT_SECRET = os.getenv("JWT_SECRET", "supersecret_dev_key_change_in_prod")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_SECONDS = 60

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
_redis_client: Optional[redis.Redis] = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


def create_redemption_token(
    offer_id: str,
    merchant_id: str,
    discount_pct: int,
    user_session_id: str,
) -> str:
    """
    Create a signed JWT redemption token valid for 60 seconds.

    Args:
        offer_id: UUID of the offer
        merchant_id: Merchant identifier
        discount_pct: Discount percentage
        user_session_id: Opaque user session identifier (no PII)

    Returns:
        Signed JWT string
    """
    now = datetime.now(timezone.utc)
    payload = {
        "offer_id": offer_id,
        "merchant_id": merchant_id,
        "discount_pct": discount_pct,
        "session_id": user_session_id,
        "iat": now,
        "exp": now + timedelta(seconds=TOKEN_EXPIRY_SECONDS),
        "jti": str(uuid.uuid4()),  # JWT ID for uniqueness
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token


def validate_token(token: str) -> Optional[dict]:
    """
    Validate a redemption JWT token.

    Returns:
        Decoded payload dict if valid and not expired.
        None if expired, invalid signature, or malformed.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.info("Token validation failed: expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Token validation failed: {e}")
        return None


def mark_redeemed(offer_id: str) -> bool:
    """
    Mark an offer as redeemed in Redis with 24h TTL.

    Args:
        offer_id: The offer UUID

    Returns:
        True if successfully marked (first redemption).
        False if already redeemed or Redis error.
    """
    try:
        r = _get_redis()
        key = f"redeemed:{offer_id}"
        # SET NX (only if not exists) with 24h TTL
        result = r.set(key, "1", ex=86400, nx=True)
        if result:
            logger.info(f"Offer {offer_id} marked as redeemed")
            return True
        else:
            logger.warning(f"Offer {offer_id} already redeemed")
            return False
    except Exception as e:
        logger.error(f"Redis error in mark_redeemed: {e}")
        return False


def is_redeemed(offer_id: str) -> bool:
    """Check if an offer has already been redeemed."""
    try:
        r = _get_redis()
        return r.exists(f"redeemed:{offer_id}") == 1
    except Exception:
        return False
