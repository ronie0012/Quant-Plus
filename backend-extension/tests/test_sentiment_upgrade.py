from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from quantplus_intelligence.analytics import (
    classify_regime,
    data_quality_score,
    detect_divergences,
    sentiment_trend,
    signal_alignment,
)
from quantplus_intelligence.history import (
    InMemorySentimentHistoryRepository,
    LABEL_VERSION,
    SentimentSnapshot,
    downsample,
    historical_signal_reliability,
)
from quantplus_intelligence.market import breadth, volume_analysis, weighted_calculation
from quantplus_intelligence.market import effective_weights
from quantplus_intelligence.calibration import evaluate_snapshot, reliability_by_regime


NOW = datetime(2026, 10, 11, 10, 30, tzinfo=timezone.utc)


def snapshot(minutes_ago: int, score: float, **metadata):
    return SentimentSnapshot(
        timestamp=(NOW - timedelta(minutes=minutes_ago)).isoformat(),
        score=score,
        label="BULLISH" if score >= 60 else "NEUTRAL",
        confidence=.8,
        data_quality="GOOD",
        regime="RISK_ON",
        components={},
        metadata=metadata,
    )


def test_trend_returns_deltas_direction_velocity_and_session_range():
    points = [snapshot(60, 49), snapshot(30, 54), snapshot(15, 58), snapshot(0, 64)]
    result = sentiment_trend(points, now=NOW)
    assert result["change_15m"] == 6
    assert result["change_30m"] == 10
    assert result["change_1h"] == 15
    assert result["direction"] == "STRONGLY_IMPROVING"
    assert result["velocity"] == "FAST"
    assert result["session_low"] == 49 and result["session_high"] == 64


def test_trend_explicitly_marks_missing_history():
    result = sentiment_trend([snapshot(0, 62)], now=NOW)
    assert result["change_1h"] is None
    assert result["direction"] == "STABLE"
    assert result["velocity"] == "UNKNOWN"


def test_breadth_technical_metrics_are_missing_when_unavailable():
    quotes = {str(i): {"change_pct": value} for i, value in enumerate([1, 1, -1, 0])}
    result = breadth(quotes, 4)
    assert result["advance_decline_ratio"] == 2
    assert result["pct_advancing"] == 50
    assert result["pct_above_20ema"] is None
    assert result["breadth_trend"] == "STABLE"


def test_breadth_coverage_threshold_does_not_fabricate_score():
    quotes = {str(i): {"change_pct": 1} for i in range(39)}
    result = breadth(quotes, 50)
    assert result["coverage"] == pytest.approx(.78)
    assert result["score"] is None


def test_volume_analysis_distinguishes_confirmation_and_divergence():
    rows = []
    for i in range(10):
        symbol = f"S{i}"
        quote = {"volume": 200 if i < 6 else 50, "change_pct": 1 if i < 6 else -1,
                 "as_of": NOW.isoformat()}
        candles = [{"time": (NOW - timedelta(days=day)).timestamp(), "volume": 100,
                    "close": 100, "open": 99, "high": 101, "low": 98} for day in range(1, 21)]
        rows.append((symbol, quote, {"source": "fyers", "candles": candles}))
    result = volume_analysis(rows, {symbol: quote for symbol, quote, _ in rows}, "closed")
    assert result["score"] is not None
    assert result["relative_volume"] == pytest.approx(1.4, abs=.01)
    assert result["confirmation"] == "BULLISH_CONFIRMATION"
    assert result["up_volume_ratio"] > result["down_volume_ratio"]


def test_volume_history_requires_fyers_and_marks_unavailable():
    rows = [("S0", {"volume": 100, "change_pct": 1, "as_of": NOW.isoformat()},
             {"source": "yahoo", "candles": []}) for _ in range(10)]
    assert volume_analysis(rows, {}, "closed")["score"] is None


def test_alignment_classifies_confirmation_and_conflict():
    bullish = {name: {"score": 75} for name in ("nifty", "breadth", "sectors", "vix", "news", "volume", "bank")}
    conflict = {"nifty": {"score": 75}, "breadth": {"score": 25}, "vix": {"score": 25}, "news": {"score": 75}}
    assert signal_alignment(bullish)["label"] == "STRONG_CONFIRMATION"
    assert signal_alignment(conflict)["label"] == "CONFLICTED"


def test_divergence_engine_detects_index_breadth_and_vix():
    components = {
        "nifty_momentum": {"score": 75, "change_pct": 1.1},
        "market_breadth": {"score": 30, "coverage": .96, "advancing": 15, "declining": 35},
        "india_vix": {"score": 30, "change_pct": 4},
        "volume_momentum": {"score": 45, "confirmation": "WEAK_BULLISH_MOVE", "confidence": .7},
        "news_sentiment": {"score": 70, "confidence": .8},
        "bank_nifty": {"score": 70, "change_pct": .3},
    }
    types = {item["type"] for item in detect_divergences(components)}
    assert "INDEX_BREADTH_DIVERGENCE" in types
    assert "INDEX_VIX_DIVERGENCE" in types
    assert "PRICE_VOLUME_DIVERGENCE" in types


def test_quality_score_exposes_component_coverage_and_bands():
    components = {
        "nifty_momentum": {"score": 70}, "bank_nifty": {"score": 70},
        "market_breadth": {"score": 75, "coverage": .96},
        "sector_breadth": {"score": 70, "observed": 8, "total": 8},
        "india_vix": {"score": 65},
        "volume_momentum": {"score": 55, "sample_size": 10, "required_samples": 10},
        "news_sentiment": {"score": 60},
    }
    score, coverage = data_quality_score(components, "open", {"counts": {"relevant": 3}})
    assert score >= 85 and coverage["breadth"] == .96


def test_regime_uses_participation_and_vix_confirmation():
    result = {
        "score": 84,
        "components": {
            "nifty_momentum": {"score": 86},
            "market_breadth": {"score": 82},
            "sector_breadth": {"score": 80},
            "india_vix": {"score": 75, "change_pct": -2},
        },
        "signal_alignment": {"score": 92},
    }
    assert classify_regime(result)[0] == "STRONG_RISK_ON"


def test_dynamic_weights_are_bounded_and_normalized_when_enabled(monkeypatch):
    from quantplus_intelligence.config import config
    monkeypatch.setattr(config, "dynamic_weights_enabled", True)
    weights = effective_weights("HIGH_VOLATILITY")
    assert sum(weights.values()) == pytest.approx(1)
    assert weights["india_vix"] <= config.market_weights["india_vix"] * 1.25 / sum(
        config.market_weights[key] + ({"india_vix": .03, "market_breadth": .02, "news_sentiment": .01}.get(key, 0))
        for key in config.market_weights
    ) + .0001


def test_forward_return_evaluation_leaves_unavailable_horizons_null():
    point = snapshot(0, 72)
    candles = [
        {"bar_end": NOW.isoformat(), "available_at": NOW.isoformat(), "completed": True, "close": 100},
        {"bar_end": (NOW + timedelta(minutes=15)).isoformat(), "available_at": (NOW + timedelta(minutes=15)).isoformat(), "completed": True, "close": 101},
    ]
    evaluate_snapshot(point, candles)
    assert point.forward_return_15m == 1
    assert point.forward_return_1h is None


def test_reliability_by_regime_requires_completed_sample_count():
    points = [snapshot(i * 5, 75, ) for i in range(30)]
    for point in points:
        point.forward_return_1h = 1
        point.metadata["label_version"] = LABEL_VERSION
    assert "RISK_ON" in reliability_by_regime(points, minimum=30)


@pytest.mark.parametrize(
    "scores,expected_label,expected_regime",
    [
        ({key: 85 for key in ("nifty_momentum", "market_breadth", "sector_breadth", "india_vix", "news_sentiment", "volume_momentum", "bank_nifty")}, "EXTREME_BULLISH", "STRONG_RISK_ON"),
        ({"nifty_momentum": 70, "market_breadth": 30, "sector_breadth": 50, "india_vix": 30, "news_sentiment": 65, "volume_momentum": 45, "bank_nifty": 65}, "NEUTRAL", "MIXED"),
        ({key: 15 for key in ("nifty_momentum", "market_breadth", "sector_breadth", "india_vix", "news_sentiment", "volume_momentum", "bank_nifty")}, "EXTREME_BEARISH", "STRONG_RISK_OFF"),
        ({key: 50 for key in ("nifty_momentum", "market_breadth", "sector_breadth", "india_vix", "news_sentiment", "volume_momentum", "bank_nifty")}, "NEUTRAL", "MIXED"),
    ],
)
def test_validation_scenarios_are_deterministic(scores, expected_label, expected_regime):
    components = {key: {"score": value, "confidence": 1} for key, value in scores.items()}
    result = weighted_calculation(components)
    result["signal_alignment"] = signal_alignment(components)
    result["regime"] = classify_regime(result)[0]
    assert result["label"] == expected_label
    assert result["regime"] == expected_regime


def test_history_repository_is_bounded_and_downsampled():
    async def scenario():
        repository = InMemorySentimentHistoryRepository(max_snapshots=3)
        for minutes in (45, 30, 15, 0):
            await repository.save(snapshot(minutes, 50 + minutes))
        values = await repository.list(NOW - timedelta(hours=1))
        assert len(values) == 3
        assert len(downsample(values, "15m")) <= len(values)
    asyncio.run(scenario())


def test_historical_reliability_waits_for_minimum_observations():
    points = [snapshot(i * 5, 75) for i in range(30)]
    for point in points:
        point.forward_return_1h = 1
        point.metadata["label_version"] = LABEL_VERSION
    result = historical_signal_reliability(points, 70, "up", minimum=30)
    assert result["reliability"] == 100 and result["observations"] == 30
