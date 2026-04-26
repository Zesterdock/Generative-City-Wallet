"""
payone_simulator.py
Simulates transaction density (load) per merchant per hour of day.
Returns "low" | "medium" | "high" load levels based on predefined hour curves.
"""

from typing import Dict

# Load curve: hour (0-23) -> float load level [0.0, 1.0]
MERCHANT_LOAD_CURVES: Dict[str, Dict[int, float]] = {
    "cafe_muller": {
        # High load morning rush 7-9, low load 10-14 (quiet hours), high again 15-17
        0: 0.0, 1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.1,
        6: 0.3, 7: 0.8, 8: 0.9, 9: 0.7, 10: 0.3, 11: 0.2,
        12: 0.2, 13: 0.25, 14: 0.3, 15: 0.8, 16: 0.85, 17: 0.75,
        18: 0.5, 19: 0.4, 20: 0.3, 21: 0.2, 22: 0.1, 23: 0.0,
    },
    "bistro_central": {
        # Low load 14-17 (post-lunch lull), rest is moderate to high
        0: 0.0, 1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0,
        6: 0.1, 7: 0.3, 8: 0.4, 9: 0.5, 10: 0.6, 11: 0.75,
        12: 0.9, 13: 0.85, 14: 0.3, 15: 0.2, 16: 0.25, 17: 0.3,
        18: 0.8, 19: 0.9, 20: 0.85, 21: 0.7, 22: 0.5, 23: 0.2,
    },
    "bakery_hoffmann": {
        # High load 6-10 (morning bakers rush), low rest of day
        0: 0.0, 1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.2,
        6: 0.8, 7: 0.9, 8: 0.95, 9: 0.85, 10: 0.7, 11: 0.4,
        12: 0.3, 13: 0.25, 14: 0.2, 15: 0.15, 16: 0.1, 17: 0.1,
        18: 0.1, 19: 0.1, 20: 0.05, 21: 0.0, 22: 0.0, 23: 0.0,
    },
}

# Default curve for unknown merchants
DEFAULT_CURVE: Dict[int, float] = {h: 0.4 for h in range(24)}


def get_merchant_load(merchant_id: str, hour: int) -> str:
    """
    Returns the load level for a merchant at a given hour of day.

    Args:
        merchant_id: Merchant identifier string
        hour: Hour of day (0-23)

    Returns:
        "low" | "medium" | "high"
    """
    curve = MERCHANT_LOAD_CURVES.get(merchant_id, DEFAULT_CURVE)
    load_value = curve.get(hour % 24, 0.4)

    if load_value < 0.35:
        return "low"
    elif load_value < 0.65:
        return "medium"
    else:
        return "high"


def get_all_merchant_ids() -> list[str]:
    """Return all known merchant IDs."""
    return list(MERCHANT_LOAD_CURVES.keys())


if __name__ == "__main__":
    # Quick smoke test
    for merchant in get_all_merchant_ids():
        loads = [get_merchant_load(merchant, h) for h in range(24)]
        print(f"{merchant}: {loads}")
