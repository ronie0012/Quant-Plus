"""Bounded, completed-bar recovery from the captured FYERS midnight REST schema."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from quantplus_intelligence.cache import MemoryCache
from quantplus_intelligence.config import INDEX_SYMBOLS, config, RULES
from quantplus_intelligence.history import InMemorySentimentHistoryRepository
from quantplus_intelligence.market import MarketEngine
from quantplus_intelligence.market_data import (
    INDEX_CANDLE_METHOD, ExistingMarketData, MarketSnapshotCollector, completed_index_quote,
)

NOW = datetime(2026, 10, 19, 7, 30, 30, tzinfo=timezone.utc)
START = NOW.replace(second=0) - timedelta(minutes=1)
MIDNIGHT = "1792368000"
REST = {"tt": MIDNIGHT, "lp": 22917.8, "prev_close_price": 23146.15}


def bar(start=START, close=22920):
    return [int(start.timestamp()), close - 1, close + 1, close - 2, close, 0]


class Provider:
    def __init__(self, now):
        self.now = now
        self.calls = []
        self.rows = {symbol: dict(REST) for symbol in INDEX_SYMBOLS.values()}
        self.history = None
        self.failure = None

    async def get(self, path, params):
        self.calls.append((path, dict(params)))
        await asyncio.sleep(0)
        if path == "quotes":
            assert params == {"symbols": ",".join(INDEX_SYMBOLS.values())}
            return {"s": "ok", "d": [{"s": "ok", "n": symbol, "v": row} for symbol, row in self.rows.items()]}
        assert path == "history" and params["resolution"] == "1"
        assert params["symbol"] in {INDEX_SYMBOLS[name] for name in ("NIFTY", "BANK", "VIX")}
        assert 0 < int(params["range_to"]) - int(params["range_from"]) <= 600
        if self.failure:
            raise self.failure
        start = self.now[0].replace(second=0, microsecond=0) - timedelta(minutes=1)
        return {"candles": self.history if self.history is not None else [bar(start), bar(start + timedelta(minutes=1), 99999)]}

    @property
    def history_calls(self):
        return [params for path, params in self.calls if path == "history"]


@pytest.fixture
def provider(monkeypatch):
    from app.data.fyers_provider import fyers
    from quantplus_intelligence import market, market_data

    now, clock = [NOW], [0]
    provider = Provider(now)
    monkeypatch.setattr(fyers, "get", provider.get)
    monkeypatch.setattr(market_data, "utcnow", lambda: now[0])
    monkeypatch.setattr(market, "utcnow", lambda: now[0])
    monkeypatch.setattr(market_data, "cache", MemoryCache(clock=lambda: clock[0]))
    provider.clock = clock
    return provider


def test_midnight_rest_recovers_only_three_indices_from_completed_bars(provider):
    async def scenario():
        data = ExistingMarketData()
        results = await asyncio.gather(*(data.indices("open") for _ in range(20)))
        assert len(provider.calls) == 4 and len(provider.history_calls) == 3
        for quotes in results:
            assert set(quotes) == {"NIFTY", "BANK", "VIX"}
            q = quotes["NIFTY"]
            assert q["price"] == 22920 and q["price"] != 99999
            assert q["as_of"] == (START + timedelta(minutes=1)).isoformat()
            assert q["bar_start"] == START.isoformat() and q["bar_end"] == q["as_of"]
            assert q["source"] == "fyers" and q["observation_source"] == "fyers_history"
            assert q["observation_method"] == INDEX_CANDLE_METHOD and q["data_quality"] == "PARTIAL"
            assert q["previous_close"] == REST["prev_close_price"]
            assert q["previous_close_source"] == "fyers_rest_same_trading_date"
            assert q["change_pct"] == pytest.approx((22920 / REST["prev_close_price"] - 1) * 100)
            assert q.get("open") is None, "A minute's open is not the session open"
        await data.indices("open")
        assert len(provider.calls) == 4
        provider.clock[0] += config.market_ttl_seconds + 1
        provider.now[0] += timedelta(seconds=config.market_ttl_seconds + 1)
        await data.indices("open")
        assert len(provider.calls) == 8 and len(provider.history_calls) == 6

    asyncio.run(scenario())


def test_shared_snapshot_restores_quantitative_index_with_honest_quality(provider):
    class Data(ExistingMarketData):
        baseline_calls = []
        async def session(self):
            return "open"

        async def universe(self):
            return {"symbols": [f"S{i}" for i in range(50)]}

        async def equities(self, symbols, session):
            return {}

        async def index_history(self, name):
            return {"candles": []}

        async def sentiment_history(self, *args, **kwargs):
            self.baseline_calls.append((args, kwargs))
            return {"source": "unavailable", "candles": []}

    class News:
        async def market_news(self):
            return {"articles": [], "counts": {"relevant": 0}, "provider_status": {"status": "available"}}

    async def scenario():
        data, shared = Data(), MemoryCache()
        collectors = [MarketSnapshotCollector(data, shared) for _ in range(2)]
        snapshots = await asyncio.gather(*(collector.snapshot() for collector in collectors))
        assert all(set(s["indices"]) == {"NIFTY", "BANK", "VIX"} for s in snapshots)
        assert len(provider.history_calls) == 3
        engine = MarketEngine(data, News(), shared, InMemorySentimentHistoryRepository(), collectors[0])
        result = await engine.sentiment()
        assert result["score"] is not None and result["label"] != "UNAVAILABLE"
        assert result["market_session"] == "open"
        assert result["data_quality"] in {"PARTIAL", "DEGRADED"}
        assert result["data_quality_score"] <= 84
        assert result["coverage"]["breadth"] == 0 and result["coverage"]["sectors"] == .12
        assert result["components"]["market_breadth"]["score"] is None
        assert result["components"]["sector_breadth"]["score"] is None
        assert result["components"]["volume_momentum"]["score"] is None
        for key in ("nifty_momentum", "bank_nifty", "india_vix"):
            component = result["components"][key]
            assert component["available"] and component["score"] is not None
            assert component["confidence"] <= .55 and component["data_quality"] == "PARTIAL"
            assert component["observation_method"] == INDEX_CANDLE_METHOD
            assert component["as_of"] == (START + timedelta(minutes=1)).isoformat()
        assert result["sectors"]["BANK"]["data_quality"] == "PARTIAL"
        assert any("1-minute candles" in warning and "confidence reduced" in warning for warning in result["warnings"])
        assert len(provider.calls) == 4 and len(provider.history_calls) == 3
        assert len(data.baseline_calls) <= 6, "Pre-tick warming must stay bounded rather than fan out to 50 stocks"

    asyncio.run(scenario())


@pytest.mark.parametrize("row", [
    None, {}, "bad", [], [1, 2], bar(START + timedelta(minutes=1)), bar(START + timedelta(minutes=2)),
    bar(START - timedelta(minutes=3)), bar(START - timedelta(days=1)),
    bar(NOW.replace(hour=0, minute=0, second=0)),
    [START.timestamp() + 1, 99, 101, 98, 100, 0],
    [START.timestamp(), 0, 101, 98, 100, 0],
    [START.timestamp(), 99, 98, 97, 100, 0],
    [START.timestamp(), 99, 101, 100, 100, 0],
    [START.timestamp(), 99, 101, 98, -100, 0],
    [START.timestamp(), 99, 101, 98, float("nan"), 0],
    [float("inf"), 99, 101, 98, 100, 0],
    [START.timestamp(), 99, 101, 98, 100, -1],
    [START.timestamp(), 99, 101, 98, True, 0],
])
def test_stale_current_future_or_malformed_bars_abstain(row):
    assert completed_index_quote("NIFTY", REST, [row], NOW) is None


def test_completion_freshness_boundary_and_unsorted_rows():
    end = START + timedelta(minutes=1)
    assert completed_index_quote("NIFTY", REST, [bar()], end) is not None
    limit = end + timedelta(seconds=RULES["quote_open_max_age_seconds"])
    assert completed_index_quote("NIFTY", REST, [bar()], limit) is not None
    assert completed_index_quote("NIFTY", REST, [bar()], limit + timedelta(microseconds=1)) is None
    result = completed_index_quote("NIFTY", REST, [bar(), bar(START - timedelta(minutes=1)), ["bad"]], NOW)
    assert result["as_of"] == end.isoformat()


def test_live_nifty_history_capture_excludes_the_in_progress_bar():
    # Sanitized output of the single authorized history probe. Observation time
    # is supplied by the completed provider bar, not by the request clock.
    observed = datetime(2026, 10, 19, 7, 38, 1, 644856, tzinfo=timezone.utc)
    rows = [
        [int(datetime(2026, 10, 19, 7, 36, tzinfo=timezone.utc).timestamp()), 22927.85, 22933.95, 22921.25, 22933.35, 571207],
        [int(datetime(2026, 10, 19, 7, 37, tzinfo=timezone.utc).timestamp()), 22933.55, 22941.05, 22927.75, 22931.15, 383656],
        [int(datetime(2026, 10, 19, 7, 38, tzinfo=timezone.utc).timestamp()), 22931.5, 22934.7, 22930.05, 22931.75, 34468],
    ]
    quote = completed_index_quote("NIFTY", REST, rows, observed)
    assert quote["price"] == 22931.15
    assert quote["as_of"] == "2026-10-19T07:38:00+00:00"
    assert quote["change_pct"] == pytest.approx(-.9288801809372194)


@pytest.mark.parametrize("changes", [
    {"prev_close_price": None}, {"prev_close_price": 0}, {"prev_close_price": -1},
    {"prev_close_price": float("nan")}, {"prev_close_price": True}, {"tt": None},
    {"tt": str(int((NOW - timedelta(days=1)).timestamp()))},
    {"tt": str(int((NOW + timedelta(minutes=5)).timestamp()))},
])
def test_no_direction_without_verified_same_day_rest_previous_close(provider, changes):
    for row in provider.rows.values():
        row.update(changes)
    assert completed_index_quote("NIFTY", {**REST, **changes}, [bar()], NOW) is None
    assert asyncio.run(ExistingMarketData().indices("open")) == {}
    assert provider.history_calls == []


def test_valid_rest_quotes_never_trigger_history(provider):
    timestamp = int((NOW - timedelta(seconds=10)).timestamp())
    for row in provider.rows.values():
        row["tt"] = str(timestamp)
    result = asyncio.run(ExistingMarketData().indices("open"))
    assert set(result) == set(INDEX_SYMBOLS)
    assert all(q.get("observation_method") != INDEX_CANDLE_METHOD for q in result.values())
    assert len(provider.calls) == 1 and provider.history_calls == []


def test_valid_nifty_rest_quote_is_preferred_while_only_missing_indices_recover(provider):
    provider.rows[INDEX_SYMBOLS["NIFTY"]]["tt"] = str(int((NOW - timedelta(seconds=5)).timestamp()))
    quotes = asyncio.run(ExistingMarketData().indices("open"))
    assert quotes["NIFTY"]["price"] == REST["lp"]
    assert quotes["NIFTY"].get("observation_method") != INDEX_CANDLE_METHOD
    assert {params["symbol"] for params in provider.history_calls} == {INDEX_SYMBOLS["BANK"], INDEX_SYMBOLS["VIX"]}


@pytest.mark.parametrize("session", ["closed", None])
def test_history_recovery_requires_verified_open_session(provider, session):
    result = asyncio.run(ExistingMarketData().indices(session))
    assert set(result) == (set(INDEX_SYMBOLS) if session == "closed" else set())
    assert provider.history_calls == []


@pytest.mark.parametrize("outage", ["empty", "error"])
def test_history_outages_are_sanitized_and_cached(provider, outage, capsys):
    if outage == "empty":
        provider.history = []
    else:
        provider.failure = RuntimeError("do-not-echo-provider-detail")

    async def scenario():
        data = ExistingMarketData()
        for _ in range(3):
            assert await data.indices("open") == {}
        assert len(provider.history_calls) == 3 and len(provider.calls) == 4

    asyncio.run(scenario())
    captured = capsys.readouterr()
    assert "do-not-echo-provider-detail" not in captured.out + captured.err


@pytest.mark.parametrize("delta", [timedelta(minutes=3), timedelta(seconds=-45)])
def test_cached_fallback_is_never_retimed_to_become_fresh_or_completed(provider, delta):
    async def scenario():
        data = ExistingMarketData()
        assert len(await data.indices("open")) == 3
        provider.now[0] += delta
        assert await data.indices("open") == {}
        assert len(provider.calls) == 4

    asyncio.run(scenario())


def test_cached_fallback_does_not_cross_exchange_trading_date(provider):
    async def scenario():
        # A cache hit must also enforce the exchange date after a wall-clock
        # rollover, even if the prior observation is less than 120 seconds old.
        provider.now[0] = NOW.replace(hour=18, minute=29)  # 23:59:30 IST
        data = ExistingMarketData()
        assert len(await data.indices("open")) == 3
        provider.now[0] += timedelta(minutes=1)
        assert await data.indices("open") == {}
        assert len(provider.calls) == 4

    asyncio.run(scenario())
