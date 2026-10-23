"""Baselines every forecast must beat: no-information, base rate and momentum."""
from __future__ import annotations

import math


def logistic(x: float) -> float:
    return 1 / (1 + math.exp(-max(min(x, 50), -50)))


def climatology(_features: dict | None = None) -> float:
    return 0.5


def base_rate(history: list[int], prior: float = 0.5, strength: float = 10) -> float:
    """Shrunk historical outperformance frequency."""
    return (sum(history) + prior * strength) / (len(history) + strength)


def momentum(features: dict, scale: float = 6.0) -> float:
    """P(outperform) from 20-session excess return, deliberately weak (|p-0.5| <= ~0.2)."""
    excess = features.get("excess_ret_20d")
    if excess is None:
        return 0.5
    return 0.3 + 0.4 * logistic(scale * excess)


def reversal(features: dict, scale: float = 10.0) -> float:
    """Short-term reversal: last 5 sessions' excess move tends to partly unwind."""
    excess = features.get("excess_ret_5d")
    if excess is None:
        return 0.5
    return 0.3 + 0.4 * logistic(-scale * excess)


BASELINES = {"climatology": climatology, "momentum": momentum, "reversal": reversal}
