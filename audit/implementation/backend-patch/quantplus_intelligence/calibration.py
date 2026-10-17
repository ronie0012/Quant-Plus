"""Forward-return evaluation for historical sentiment snapshots.

Only completed candles are used.  Missing future candles remain ``None`` so
calibration never becomes an invented backtest.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from .history import SentimentSnapshot


HORIZONS = {
    "forward_return_15m": timedelta(minutes=15),
    "forward_return_30m": timedelta(minutes=30),
    "forward_return_1h": timedelta(hours=1),
    "forward_return_eod": None,
    "forward_return_1d": timedelta(days=1),
}


def _time(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromtimestamp(value, timezone.utc) if isinstance(value, (int, float)) else datetime.fromisoformat(value.replace("Z", "+00:00"))


INDIA = timezone(timedelta(hours=5, minutes=30))
LABEL_VERSION = "completed-bars-v2"


def evaluate_snapshot(snapshot: SentimentSnapshot, candles: list[dict[str, Any]], *,
                      now: datetime | None = None, session_days: list[str] | None = None) -> SentimentSnapshot:
    """Mature exact horizons using explicit completed-bar availability.

    ``bar_end`` is a close instant, not the provider's bar-start timestamp.
    The 1d horizon requires an externally verified exchange-session calendar.
    Legacy labels are retained in metadata and excluded from calibration.
    """
    cutoff = _time(now or datetime.now(timezone.utc))
    decision = _time(snapshot.timestamp)
    if snapshot.metadata.get("label_version") != LABEL_VERSION:
        old = {name: getattr(snapshot, name) for name in HORIZONS if getattr(snapshot, name) is not None}
        if old:
            snapshot.metadata.setdefault("quarantined_labels", []).append(old)
        for name in HORIZONS:
            setattr(snapshot, name, None)
        snapshot.metadata["label_version"] = LABEL_VERSION
    completed = {}
    for candle in candles:
        if candle.get("completed") is not True or not candle.get("bar_end") or not candle.get("available_at"):
            continue
        try:
            end, available = _time(candle["bar_end"]), _time(candle["available_at"])
            close = float(candle["close"])
            import math
            if math.isfinite(close) and close > 0 and end <= available <= cutoff:
                completed[end] = (close, available)
        except (ValueError, TypeError, KeyError):
            continue
    # No later price may be used as the baseline for a prior decision.
    base = completed.get(decision)
    if not base or base[1] > decision:
        return snapshot
    local = decision.astimezone(INDIA)
    eod = local.replace(hour=15, minute=30, second=0, microsecond=0)
    for field, horizon in HORIZONS.items():
        if field == "forward_return_eod":
            target = eod if local <= eod else None
        elif field == "forward_return_1d":
            days = sorted(set(session_days or []))
            next_day = next((day for day in days if day > local.date().isoformat()), None)
            target = datetime.fromisoformat(next_day + "T" + local.strftime("%H:%M:%S") + "+05:30") if next_day else None
        else:
            target = decision + horizon
        if target is None or target > cutoff:
            continue
        endpoint = completed.get(target)
        if endpoint:
            setattr(snapshot, field, round((endpoint[0] / base[0] - 1) * 100, 6))
    return snapshot


def reliability_by_regime(snapshots: list[SentimentSnapshot], minimum: int = 30) -> dict[str, dict[str, Any]]:
    result = {}
    for regime in sorted({snapshot.regime for snapshot in snapshots}):
        rows = [snapshot for snapshot in snapshots if snapshot.regime == regime and snapshot.forward_return_1h is not None and snapshot.score is not None]
        if len(rows) < minimum:
            continue
        result[regime] = {
            "observations": len(rows),
            "bullish_observations": sum(row.score >= 70 for row in rows),
            "bearish_observations": sum(row.score <= 30 for row in rows),
            "bullish_signal_reliability": _reliability([row for row in rows if row.score >= 70], minimum, True),
            "bearish_signal_reliability": _reliability([row for row in rows if row.score <= 30], minimum, False),
        }
    return result


def _reliability(rows, minimum, bullish):
    if len(rows) < minimum:
        return None
    return round(sum((row.forward_return_1h > 0) if bullish else (row.forward_return_1h < 0) for row in rows) / len(rows) * 100, 1)
