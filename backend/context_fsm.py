"""
context_fsm.py
Finite State Machine for evaluating city context states.
Uses the `transitions` library and loads state definitions from city_config.yaml.
"""

import yaml
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional
from transitions import Machine

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent / "city_config.yaml"

# ── Time-of-day buckets ────────────────────────────────────────────────────────

TOD_BUCKETS = {
    "morning":   range(5, 11),    # 05:00 – 10:59
    "lunch":     range(11, 14),   # 11:00 – 13:59
    "afternoon": range(14, 17),   # 14:00 – 16:59
    "evening":   range(17, 22),   # 17:00 – 21:59
    "night":     range(22, 24),   # 22:00 – 23:59 + 00:00 – 04:59
}


def get_tod_bucket(hour: int) -> str:
    """Map an integer hour (0-23) to a named TOD bucket."""
    for bucket, hours in TOD_BUCKETS.items():
        if hour in hours:
            return bucket
    return "night"  # 00:00-04:59 fallback


# ── Load config ────────────────────────────────────────────────────────────────

def _load_config() -> list[dict]:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return cfg.get("states", [])


STATE_DEFINITIONS = _load_config()
STATE_NAMES = [s["name"] for s in STATE_DEFINITIONS]

# Ensure GENERIC_BROWSE is always last (catch-all)
if "GENERIC_BROWSE" not in STATE_NAMES:
    STATE_NAMES.append("GENERIC_BROWSE")

# ── FSM class ─────────────────────────────────────────────────────────────────

class CityContextFSM:
    """
    Finite State Machine that holds the current city context state.
    Transitions are driven by evaluate_context().
    """

    def __init__(self):
        self.state_defs = STATE_DEFINITIONS
        self._current_state = "GENERIC_BROWSE"

        self.machine = Machine(
            model=self,
            states=STATE_NAMES,
            initial="GENERIC_BROWSE",
            auto_transitions=True,   # allow model.to_STATE_NAME() calls
            ignore_invalid_triggers=True,
        )

    def get_state_def(self, state_name: str) -> Optional[dict]:
        for s in self.state_defs:
            if s["name"] == state_name:
                return s
        return None

    def evaluate_context(
        self,
        weather_condition: str,
        tod_bucket: str,
        payone_load: str,
    ) -> str:
        """
        Evaluate which FSM state best matches the provided signals.
        Checks each state definition in order; first match wins.
        Falls back to GENERIC_BROWSE.
        """
        weather_lower = weather_condition.lower()
        tod_lower = tod_bucket.lower()
        load_lower = payone_load.lower()

        for state_def in self.state_defs:
            conditions = state_def.get("conditions", {})
            if not conditions:
                # Empty conditions = catch-all, keep as fallback
                continue

            weather_ok = True
            tod_ok = True
            load_ok = True

            if "weather" in conditions:
                weather_ok = any(
                    w.lower() in weather_lower for w in conditions["weather"]
                )
            if "tod" in conditions:
                tod_ok = tod_lower in [t.lower() for t in conditions["tod"]]
            if "payone_load" in conditions:
                req_load = conditions["payone_load"]
                if req_load == "any":
                    load_ok = True
                else:
                    load_ok = load_lower == req_load.lower()

            if weather_ok and tod_ok and load_ok:
                target = state_def["name"]
                # Transition FSM to matched state
                transition_fn = getattr(self, f"to_{target}", None)
                if transition_fn:
                    transition_fn()
                self._current_state = target
                logger.info(
                    f"FSM → {target} "
                    f"(weather={weather_condition}, tod={tod_bucket}, load={payone_load})"
                )
                return target

        # Fallback
        self.to_GENERIC_BROWSE()
        self._current_state = "GENERIC_BROWSE"
        return "GENERIC_BROWSE"

    def get_context_payload(
        self,
        weather_condition: str,
        tod_bucket: str,
        payone_load: str,
        intent: Optional[dict] = None,
        merchant_id: Optional[str] = None,
    ) -> dict:
        """Return a full context payload dict with current state + all signals."""
        state_def = self.get_state_def(self._current_state) or {}
        return {
            "context_state": self._current_state,
            "offer_archetype": state_def.get("offer_archetype", "general"),
            "emotional_frame": state_def.get("emotional_frame", "factual"),
            "signals": {
                "weather_condition": weather_condition,
                "tod_bucket": tod_bucket,
                "payone_load": payone_load,
                "merchant_id": merchant_id,
            },
            "intent": intent or {},
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }


# Singleton instance
_fsm_instance: Optional[CityContextFSM] = None


def get_fsm() -> CityContextFSM:
    global _fsm_instance
    if _fsm_instance is None:
        _fsm_instance = CityContextFSM()
    return _fsm_instance


def evaluate_context(
    weather_condition: str,
    tod_bucket: str,
    payone_load: str,
) -> str:
    return get_fsm().evaluate_context(weather_condition, tod_bucket, payone_load)


def get_tod_bucket_for_hour(hour: int) -> str:
    return get_tod_bucket(hour)
