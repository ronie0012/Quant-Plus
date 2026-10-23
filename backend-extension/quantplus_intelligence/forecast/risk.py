"""Risk-first forecasts: horizon volatility, ranges, drawdown and event-shock probability.

Volatility was the only audited PASS in the independent ML review, so ranges lead the card.
"""
from __future__ import annotations

import math
from statistics import NormalDist

Z = NormalDist()


def ewma_vol(returns: list[float], lam: float = 0.94) -> float | None:
    """RiskMetrics EWMA daily volatility."""
    if len(returns) < 10:
        return None
    var = sum(r * r for r in returns[:10]) / 10
    for r in returns[10:]:
        var = lam * var + (1 - lam) * r * r
    return math.sqrt(var)


def horizon_vol(daily_vol: float, horizon: int) -> float:
    return daily_vol * math.sqrt(horizon)


def quantiles(sigma_h: float, drift: float = 0.0, margin: float | None = None) -> dict[str, float]:
    """10/50/90 excess-return quantiles; a conformal margin widens the outer band."""
    widen = margin or 0.0
    return {"0.1": drift + Z.inv_cdf(0.1) * sigma_h - widen, "0.5": drift,
            "0.9": drift + Z.inv_cdf(0.9) * sigma_h + widen}


def p_drawdown(sigma_h: float, depth: float) -> float:
    """P(path minimum falls below -depth within the horizon), reflection principle, zero drift."""
    if sigma_h <= 0:
        return 0.0
    return min(1.0, 2 * Z.cdf(-depth / sigma_h))


def p_event_shock(sigma_h: float, scheduled_event_in_horizon: bool, base: float = 0.05,
                  event_uplift: float = 0.20) -> float:
    """P(a >=2-sigma move). Normal tails give ~0.046; scheduled results fatten them."""
    tail = 2 * Z.cdf(-2.0)
    return min(0.95, max(base, tail) + (event_uplift if scheduled_event_in_horizon else 0.0))


def regime(vol_20d: float | None, vol_history: list[float]) -> str:
    if vol_20d is None or len(vol_history) < 60:
        return "UNKNOWN"
    ranked = sorted(vol_history)
    pct = sum(v < vol_20d for v in ranked) / len(ranked)
    return "STRESSED" if pct >= 0.85 else "ELEVATED" if pct >= 0.5 else "CALM"
