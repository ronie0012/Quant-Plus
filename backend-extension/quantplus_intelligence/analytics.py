"""Pure deterministic analytics used by the market sentiment engine."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from .common import clamp, number
from .config import RULES


def _score_direction(score: float | None) -> str:
    if score is None:
        return "unavailable"
    if score >= 60:
        return "bullish"
    if score <= 40:
        return "bearish"
    return "neutral"


def trend_state(change: float | None) -> str:
    if change is None or abs(change) < RULES["trend_change_threshold"]:
        return "STABLE"
    if change >= RULES["strong_trend_change_threshold"]:
        return "STRONGLY_IMPROVING"
    if change <= -RULES["strong_trend_change_threshold"]:
        return "STRONGLY_DETERIORATING"
    return "IMPROVING" if change > 0 else "DETERIORATING"


def velocity(change: float | None) -> str:
    if change is None:
        return "UNKNOWN"
    magnitude = abs(change)
    if magnitude >= RULES["fast_velocity_change"]:
        return "FAST"
    if magnitude >= RULES["slow_velocity_change"]:
        return "MODERATE"
    return "SLOW"


def _as_datetime(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _at_or_before(snapshots: list[Any], target: datetime):
    candidates = [s for s in snapshots if _as_datetime(s.timestamp) <= target]
    return max(candidates, key=lambda item: _as_datetime(item.timestamp)) if candidates else None


def sentiment_trend(snapshots: list[Any], now: datetime | None = None, current: float | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    ordered = sorted(snapshots, key=lambda item: _as_datetime(item.timestamp))
    latest = ordered[-1] if ordered else None
    current = current if current is not None else (latest.score if latest else None)

    def delta(minutes: int):
        previous = _at_or_before(ordered, now - timedelta(minutes=minutes))
        return round(current - previous.score, 2) if current is not None and previous and previous.score is not None else None

    changes = {"change_15m": delta(15), "change_30m": delta(30), "change_1h": delta(60)}
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    session = [s for s in ordered if _as_datetime(s.timestamp) >= day_start and s.score is not None]
    one_hour = changes["change_1h"]
    return {
        "current": current,
        **changes,
        "day_change": round(current - session[0].score, 2) if current is not None and session and session[0].score is not None else None,
        "session_high": max((s.score for s in session), default=None),
        "session_low": min((s.score for s in session), default=None),
        "direction": trend_state(one_hour),
        "trend": trend_state(one_hour),
        "velocity": velocity(one_hour),
    }


def signal_alignment(components: dict[str, dict[str, Any]]) -> dict[str, Any]:
    directions = [_score_direction(value.get("score")) for value in components.values() if value.get("score") is not None]
    directions = [direction for direction in directions if direction != "unavailable"]
    if not directions:
        return {"score": None, "label": "UNAVAILABLE", "available": 0, "bullish": 0, "bearish": 0, "neutral": 0}
    counts = {direction: directions.count(direction) for direction in ("bullish", "bearish", "neutral")}
    dominant = max(counts.values())
    opposing = counts["bearish"] if counts["bullish"] >= counts["bearish"] else counts["bullish"]
    score = round(50 + 50 * (dominant - opposing) / len(directions))
    if counts["neutral"] == dominant and counts["bullish"] == counts["bearish"]:
        score = 50
    if counts["bullish"] and counts["bearish"] and abs(counts["bullish"] - counts["bearish"]) <= 1:
        score = min(score, 49)
    if score >= RULES["alignment_strong_confirmation"]:
        alignment = "STRONG_CONFIRMATION"
    elif score >= RULES["alignment_confirmation"]:
        alignment = "CONFIRMATION"
    elif score >= RULES["alignment_mixed"]:
        alignment = "MIXED"
    elif score >= RULES["alignment_conflicted"]:
        alignment = "CONFLICTED"
    else:
        alignment = "STRONG_CONFLICT"
    return {"score": score, "label": alignment, "available": len(directions), **counts}


def detect_divergences(components: dict[str, dict[str, Any]], sectors: dict[str, dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    sectors = sectors or {}
    result: list[dict[str, Any]] = []

    def add(kind: str, severity: str, direction: str, description: str, confidence: float):
        result.append({"type": kind, "severity": severity, "direction": direction,
                       "description": description, "confidence": round(clamp(confidence, 0, 1), 3)})

    nifty = components.get("nifty_momentum", {})
    breadth = components.get("market_breadth", {})
    vix = components.get("india_vix", {})
    volume = components.get("volume_momentum", {})
    news = components.get("news_sentiment", {})
    bank = components.get("bank_nifty", {})
    nifty_change = number(nifty.get("change_pct"))
    breadth_score = number(breadth.get("score"))
    if nifty_change is not None and abs(nifty_change) >= RULES["divergence_pct"] and breadth_score is not None:
        if nifty_change > 0 and breadth_score <= 40:
            add("INDEX_BREADTH_DIVERGENCE", "MEDIUM", "BEARISH_WARNING",
                "Nifty is rising, but participation is weak. Gains are concentrated in a limited number of heavyweight stocks.",
                min(.95, .65 + breadth.get("coverage", 0) * .3))
        elif nifty_change < 0 and breadth_score >= 60:
            add("POSITIVE_BREADTH_DIVERGENCE", "MEDIUM", "BULLISH_WARNING",
                "Nifty is falling while most observed constituents advance, indicating a potentially concentrated decline.",
                min(.95, .65 + breadth.get("coverage", 0) * .3))
        elif nifty_change > 0 and breadth_score >= 60 and volume.get("confirmation") == "BULLISH_CONFIRMATION":
            add("BROAD_BASED_RALLY", "LOW", "BULLISH_CONFIRMATION",
                "The index advance is supported by broad participation and confirming volume.", .85)

    volume_confirmation = volume.get("confirmation")
    if nifty_change is not None and volume.get("score") is not None:
        if nifty_change > RULES["divergence_pct"] and volume_confirmation in ("WEAK_BULLISH_MOVE", "PRICE_VOLUME_DIVERGENCE"):
            add("PRICE_VOLUME_DIVERGENCE", "MEDIUM", "BEARISH_WARNING",
                "Price is rising without sufficient volume conviction.", volume.get("confidence", .5))
        elif nifty_change < -RULES["divergence_pct"] and volume_confirmation == "WEAK_BEARISH_MOVE":
            add("PRICE_VOLUME_DIVERGENCE", "MEDIUM", "BULLISH_WARNING",
                "Price is falling without sufficient volume conviction.", volume.get("confidence", .5))

    vix_change = number(vix.get("change_pct"))
    if nifty_change is not None and vix_change is not None:
        if nifty_change > RULES["divergence_pct"] and vix_change >= RULES["vix_sharp_change_pct"]:
            add("INDEX_VIX_DIVERGENCE", "HIGH", "BEARISH_WARNING",
                "Nifty is rising while India VIX is increasing sharply, warning that risk is rising with the move.", .86)
        elif nifty_change < -RULES["divergence_pct"] and vix_change <= -RULES["vix_sharp_change_pct"]:
            add("INDEX_VIX_DIVERGENCE", "MEDIUM", "BULLISH_WARNING",
                "Nifty is falling while India VIX is compressing, so volatility is not confirming the decline.", .8)

    news_score = number(news.get("score"))
    if nifty_change is not None and news_score is not None and abs(nifty_change) >= RULES["divergence_pct"]:
        if (nifty_change > 0 and news_score <= 40) or (nifty_change < 0 and news_score >= 60):
            add("NEWS_PRICE_DIVERGENCE", "LOW", "CAUTION",
                "Market news direction conflicts with the latest index move.", news.get("confidence", .5))

    bank_change = number(bank.get("change_pct"))
    if nifty_change is not None and bank_change is not None and (nifty_change - bank_change) >= 1.5:
        add("BANK_NIFTY_DIVERGENCE", "LOW", "BEARISH_WARNING",
            "Nifty is outperforming while Bank Nifty lags materially.", .72)
    if nifty.get("score") is not None and breadth_score is not None and abs(nifty["score"] - breadth_score) >= 20:
        add("MOMENTUM_BREADTH_DIVERGENCE", "MEDIUM",
            "BEARISH_WARNING" if nifty["score"] > breadth_score else "BULLISH_WARNING",
            "Index momentum and constituent breadth are moving in different directions.", .78)

    available_sectors = [item for item in sectors.values() if item.get("score") is not None]
    if available_sectors and breadth_score is not None:
        sector_score = sum(item["score"] for item in available_sectors) / len(available_sectors)
        if abs(sector_score - breadth_score) >= 20:
            add("SECTOR_INDEX_DIVERGENCE", "LOW", "CAUTION",
                "Sector participation is not keeping pace with constituent breadth.", .7)
    return result


def classify_regime(result: dict[str, Any]) -> tuple[str, list[str]]:
    components = result.get("components", {})
    score = number(result.get("score"))
    if score is None:
        return "MIXED", ["No composite score is available"]
    nifty = number(components.get("nifty_momentum", {}).get("score"))
    broad = number(components.get("market_breadth", {}).get("score"))
    sectors = number(components.get("sector_breadth", {}).get("score"))
    vix = components.get("india_vix", {})
    vix_score = number(vix.get("score"))
    vix_change = number(vix.get("change_pct"))
    alignment = (result.get("signal_alignment") or {}).get("score")
    drivers: list[str] = []
    if vix_change is not None and vix_change >= RULES["high_volatility_pct"]:
        return "HIGH_VOLATILITY", ["India VIX is rising sharply"]
    if vix_score is not None and vix_score >= RULES["low_volatility_score"] and abs(score - 50) <= 12:
        return "LOW_VOLATILITY", ["India VIX is compressed while the composite is balanced"]
    bullish = score >= 60
    bearish = score <= 40
    broad_bullish = broad is not None and broad >= 60
    broad_bearish = broad is not None and broad <= 40
    sector_bullish = sectors is not None and sectors >= 60
    sector_bearish = sectors is not None and sectors <= 40
    if bullish and broad_bullish and sector_bullish:
        drivers.extend(["index momentum", "broad participation", "sector confirmation"])
        return ("STRONG_RISK_ON" if score >= 80 and (alignment or 0) >= 85 else "RISK_ON" if (vix_score or 0) >= 60 else "TRENDING_BULLISH"), drivers
    if bearish and broad_bearish and sector_bearish:
        drivers.extend(["index weakness", "negative breadth", "sector pressure"])
        return ("STRONG_RISK_OFF" if score <= 20 and (alignment or 0) >= 85 else "RISK_OFF" if (vix_score or 0) <= 40 else "TRENDING_BEARISH"), drivers
    if bullish:
        return "SIDEWAYS_BULLISH", ["Composite is bullish but participation is mixed"]
    if bearish:
        return "SIDEWAYS_BEARISH", ["Composite is bearish but participation is mixed"]
    return "MIXED" if (alignment or 50) < 55 else "SIDEWAYS", ["Index, breadth and risk signals are mixed"]


def data_quality_score(components: dict[str, dict[str, Any]], session: str | None, news: dict[str, Any] | None = None) -> tuple[int, dict[str, float]]:
    market_data = [components.get("nifty_momentum", {}).get("score"), components.get("bank_nifty", {}).get("score")]
    market_coverage = sum(value is not None for value in market_data) / len(market_data)
    breadth = components.get("market_breadth", {})
    breadth_coverage = number(breadth.get("coverage")) or 0
    sector = components.get("sector_breadth", {})
    sector_coverage = (number(sector.get("observed")) or 0) / max(number(sector.get("total")) or 8, 1)
    volume = components.get("volume_momentum", {})
    volume_coverage = min(1, (number(volume.get("sample_size")) or 0) / max(number(volume.get("required_samples")) or 10, 1))
    vix_coverage = 1.0 if components.get("india_vix", {}).get("score") is not None else 0.0
    news_coverage = 0.0 if not news else min(1, (number(news.get("counts", {}).get("relevant")) or 0) / 3)
    now = datetime.now(timezone.utc)
    timestamps = []
    for component in components.values():
        value = component.get("as_of")
        if value:
            try:
                observed = _as_datetime(value)
                age = max(0, (now - observed).total_seconds())
                limit = 120 if session == "open" else 5 * 86400
                timestamps.append(clamp(1 - age / limit))
            except (TypeError, ValueError):
                continue
    freshness = sum(timestamps) / len(timestamps) if timestamps else 0
    coverage = {"market_data": round(market_coverage, 2), "breadth": round(breadth_coverage, 2),
                "volume": round(volume_coverage, 2), "sectors": round(sector_coverage, 2),
                "vix": round(vix_coverage, 2), "news": round(news_coverage, 2), "freshness": round(freshness, 2)}
    weights = RULES["quality_weights"]
    score = round(sum(coverage.get(key, 0) * weight for key, weight in weights.items()) / sum(weights.values()) * 100)
    if session is None:
        score = min(score, 59)
    return score, coverage
