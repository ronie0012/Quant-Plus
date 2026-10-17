from datetime import datetime, timedelta, timezone

from quantplus_intelligence.calibration import evaluate_snapshot, reliability_by_regime
from quantplus_intelligence.history import LABEL_VERSION, SentimentSnapshot

UTC = timezone.utc
START = datetime(2026, 10, 14, 4, 30, tzinfo=UTC)


def snapshot():
    return SentimentSnapshot(timestamp=START.isoformat(), score=75, label="BULLISH",
                             confidence=.5, data_quality="PARTIAL", regime="TEST")


def bar(end, close, **extra):
    return {"bar_end": end.isoformat(), "available_at": end.isoformat(),
            "completed": True, "close": close, **extra}


def test_eod_never_matures_from_morning_bars():
    point = evaluate_snapshot(snapshot(), [bar(START, 100), bar(START + timedelta(minutes=15), 101)], now=START + timedelta(minutes=15))
    assert point.forward_return_15m == 1
    assert point.forward_return_eod is None


def test_eod_uses_exchange_timezone_and_completed_close():
    end = datetime(2026, 10, 14, 10, 0, tzinfo=UTC)
    point = evaluate_snapshot(snapshot(), [bar(START, 100), bar(end, 105)], now=end)
    assert point.forward_return_eod == 5
    point = evaluate_snapshot(snapshot(), [bar(START, 100), bar(end, 105, completed=False)], now=end)
    assert point.forward_return_eod is None


def test_late_availability_and_future_outcomes_are_not_used():
    end = START + timedelta(minutes=15)
    assert evaluate_snapshot(snapshot(), [bar(START, 100), bar(end, 101)], now=START).forward_return_15m is None
    assert evaluate_snapshot(snapshot(), [bar(START, 100, available_at=end.isoformat()), bar(end, 101)], now=end).forward_return_15m is None


def test_missing_signal_denominator_remains_unavailable():
    points = [snapshot() for _ in range(30)]
    for point in points:
        point.forward_return_1h = 1
        point.metadata["label_version"] = LABEL_VERSION
    result = reliability_by_regime(points)["TEST"]
    assert result["bullish_signal_reliability"] == 100
    assert result["bearish_signal_reliability"] is None
    assert result["bearish_observations"] == 0


def test_legacy_labels_are_quarantined_and_missing_bars_abstain():
    point = snapshot()
    point.forward_return_eod = 3
    evaluate_snapshot(point, [{"time": START.timestamp(), "close": 100}])
    assert point.forward_return_eod is None
    assert point.metadata["quarantined_labels"] == [{"forward_return_eod": 3}]


def test_next_session_horizon_requires_supplied_calendar():
    friday = datetime(2026, 10, 16, 4, 30, tzinfo=UTC)
    monday = datetime(2026, 10, 19, 4, 30, tzinfo=UTC)
    point = snapshot()
    point.timestamp = friday.isoformat()
    candles = [bar(friday, 100), bar(monday, 102)]
    assert evaluate_snapshot(point, candles, now=monday).forward_return_1d is None
    assert evaluate_snapshot(point, candles, now=monday, session_days=["2026-10-16", "2026-10-19"]).forward_return_1d == 2
