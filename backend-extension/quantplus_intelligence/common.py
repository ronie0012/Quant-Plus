from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone

logger = logging.getLogger("quantplus.intelligence")
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(logging.StreamHandler())
logger.propagate = False


def utcnow():
    return datetime.now(timezone.utc)


def log(event, **fields):
    logger.info(json.dumps({"event": event, **fields}, default=str))


def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def clamp(value, low=0, high=100):
    return max(low, min(high, value))


def label(score, market=False):
    if score is None:
        return "UNAVAILABLE"
    score = round(clamp(score))
    if score <= 20:
        return "EXTREME_BEARISH" if market else "STRONGLY_BEARISH"
    if score <= 40:
        return "BEARISH"
    if score <= 59:
        return "NEUTRAL"
    if score <= 79:
        return "BULLISH"
    return "EXTREME_BULLISH" if market else "STRONGLY_BULLISH"
