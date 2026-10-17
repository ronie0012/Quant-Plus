"""FYERS volume analytics. No I/O: every consumer uses the collected snapshot."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from .common import clamp, number
from .config import RULES
from .market_data import IST


def relative_volume(quote, daily, intraday=None):
    volume = number(quote.get("volume"))
    if not volume or volume <= 0 or not quote.get("as_of"):
        return None
    observed = datetime.fromisoformat(quote["as_of"]).astimezone(IST)
    minute = min(930, observed.hour * 60 + observed.minute + observed.second / 60)
    elapsed = clamp((minute - 555) / 375, 0, 1)
    if elapsed < RULES["volume_min_elapsed"]:
        return None
    prior = defaultdict(dict)
    if intraday and intraday.get("source") == "fyers" and intraday.get("interval") == "5m":
        for candle in intraday.get("candles", []):
            local = datetime.fromtimestamp(candle["time"], IST)
            m = local.hour * 60 + local.minute
            if local.date() < observed.date() and 555 <= m < 930 and number(candle.get("volume")) is not None:
                prior[local.date()][m] = candle["volume"]
    baselines = []
    for bars in prior.values():
        # Require a complete normal session. Partial provider days must never
        # lower the denominator and manufacture high RVOL.
        if not all(m in bars for m in range(555, 930, 5)):
            continue
        cumulative = sum(v * clamp((minute-m)/5, 0, 1) for m, v in bars.items())
        if cumulative > 0:
            baselines.append(cumulative)
    if len(baselines) >= RULES["min_baseline_sessions"]:
        expected = sum(baselines) / len(baselines)
        method, confidence = "EQUIVALENT_TIME_OF_DAY", .9
        sessions = len(baselines)
    else:
        if not daily or daily.get("source") != "fyers":
            return None
        volumes = [c["volume"] for c in daily.get("candles", [])
                   if datetime.fromtimestamp(c["time"], IST).date() < observed.date()
                   and number(c.get("volume")) and c["volume"] > 0][-20:]
        if len(volumes) < RULES["min_daily_volume_sessions"]:
            return None
        expected = sum(volumes) / len(volumes) * elapsed
        method, confidence = ("DAILY_AVERAGE" , .85) if elapsed == 1 else ("LINEAR_TIME_FALLBACK", .55)
        sessions = len(volumes)
    return {"current_volume": volume, "expected_volume": expected, "relative_volume": volume / expected,
            "baseline_method": method, "baseline_sessions": sessions, "confidence": confidence}


def analyze_volume(quotes, daily_histories, intraday_histories=None, minimum=None):
    minimum = minimum if minimum is not None else RULES["min_volume_samples"]
    intraday_histories = intraday_histories or {}
    observations = {}
    for symbol, quote in quotes.items():
        if number(quote.get("change_pct")) is None:
            continue
        observation = relative_volume(quote, daily_histories.get(symbol), intraday_histories.get(symbol))
        if observation:
            observations[symbol] = {**observation, "change_pct": quote["change_pct"]}
    observed = len(observations)
    enough = observed >= minimum
    up = [r for r in observations.values() if r["change_pct"] > RULES["unchanged_pct"]]
    down = [r for r in observations.values() if r["change_pct"] < -RULES["unchanged_pct"]]
    up_volume, down_volume = sum(r["current_volume"] for r in up), sum(r["current_volume"] for r in down)
    total = up_volume + down_volume
    up_ratio = up_volume / total if total else None
    down_ratio = down_volume / total if total else None
    rvol = sum(r["relative_volume"] for r in observations.values()) / observed if observed else None
    # Equal constituent directional momentum with bounded RVOL influence avoids
    # letting a single high-share-count stock own the sentiment component.
    weights = [min(r["relative_volume"], RULES["max_rvol_weight"]) for r in observations.values()]
    signed = sum(clamp(r["change_pct"] / RULES["momentum_pct_scale"], -1, 1) * w
                 for r, w in zip(observations.values(), weights))
    score = 50 + 50 * signed / sum(weights) if enough and sum(weights) else None
    confirmation = "UNAVAILABLE" if not enough else "MIXED"
    if enough and score is not None:
        if score >= 60 and up_ratio is not None and up_ratio > .5:
            confirmation = "BULLISH_CONFIRMATION" if rvol >= RULES["volume_confirmation_rvol"] else "WEAK_BULLISH_MOVE"
        elif score <= 40 and down_ratio is not None and down_ratio > .5:
            confirmation = "BEARISH_CONFIRMATION" if rvol >= RULES["volume_confirmation_rvol"] else "WEAK_BEARISH_MOVE"
    fallback = any(r["baseline_method"] == "LINEAR_TIME_FALLBACK" for r in observations.values())
    coverage = observed / len(quotes) if quotes else 0
    confidence = sum(r["confidence"] for r in observations.values()) / observed if enough else 0
    return {"score": round(score, 2) if score is not None else None,
            "confidence": round(confidence * (.75 + .25 * coverage), 3),
            "sample_size": observed, "required_samples": minimum, "coverage": coverage,
            "sample_symbols": sorted(observations), "relative_volume": round(rvol, 3) if rvol is not None else None,
            "current_cumulative_volume": sum(r["current_volume"] for r in observations.values()) if observed else None,
            "up_volume": up_volume if observed else None, "down_volume": down_volume if observed else None,
            "up_volume_ratio": up_ratio, "down_volume_ratio": down_ratio, "volume_breadth": up_ratio * 100 if up_ratio is not None else None,
            "advancing_above_average": sum(r["relative_volume"] >= 1 for r in up),
            "declining_above_average": sum(r["relative_volume"] >= 1 for r in down),
            "confirmation": confirmation, "price_volume_divergence": confirmation.startswith("WEAK_"),
            "baseline_methods": sorted({r["baseline_method"] for r in observations.values()}),
            "data_quality": "PARTIAL" if enough and fallback else "GOOD" if enough else "DEGRADED",
            "reason": "Insufficient FYERS baseline coverage" if not enough else "Linear time fallback has no intraday seasonality" if fallback else None,
            "observations": observations,
            "method": "Bounded RVOL-weighted constituent momentum; equivalent-time-of-day baseline, daily linear fallback if unavailable"}
