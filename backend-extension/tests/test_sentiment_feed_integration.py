"""End-to-end coverage recovery using genuine-shaped stream data, no network."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from quantplus_intelligence.cache import MemoryCache
from quantplus_intelligence.config import INDEX_SYMBOLS, config
from quantplus_intelligence.history import InMemorySentimentHistoryRepository
from quantplus_intelligence.market import MarketEngine, breadth
from quantplus_intelligence.market_data import ExistingMarketData, MarketSnapshotCollector

NOW = datetime(2026, 10, 19, 8, 0, tzinfo=timezone.utc)
SYMBOLS = [f"S{i:02}" for i in range(50)]


def daily(now):
    return {"source": "fyers", "interval": "1d", "candles": [
        {"time": (now - timedelta(days=i)).timestamp(), "open": 99, "high": 102,
         "low": 98, "close": 100, "volume": 1000} for i in range(1, 61)]}


def intraday(now):
    return {"source": "fyers", "interval": "5m", "candles": [
        {"time": ((now - timedelta(days=day)).replace(hour=3, minute=45, second=0)
                  + timedelta(minutes=minute)).timestamp(), "close": 100, "volume": 10}
        for day in range(1, 6) for minute in range(0, 375, 5)]}


class Feed:
    def __init__(self, now):
        self.now, self.calls, self.released = now, [], False

    async def ensure(self, symbols, session):
        self.calls.append((list(symbols), session))
        self.released = session != "open"
        return self.status()

    def status(self):
        return {"state": "idle" if self.released else "active", "reason": None, "connected": not self.released}

    def quote(self, symbol):
        if self.released:
            return None
        return {"source": "fyers", "symbol": symbol, "price": 101, "previous_close": 100,
                "change_pct": 1, "open": 100, "volume": 600, "as_of": self.now[0].isoformat()}


class Data(ExistingMarketData):
    def __init__(self, feed):
        super().__init__(feed)
        self.history_calls = []

    async def session(self):
        return "open"

    async def universe(self):
        return {"symbols": SYMBOLS, "industries": {}, "source": "official-fixture"}

    async def equities(self, symbols, session):
        return {s: self.feed.quote(s) for s in symbols}

    async def index_history(self, name):
        return daily(self.feed.now[0])

    async def sentiment_history(self, symbol, intraday=False):
        self.history_calls.append((symbol, intraday))
        return globals()["intraday"](self.feed.now[0]) if intraday else daily(self.feed.now[0])


class News:
    async def market_news(self):
        return {"articles": [], "counts": {"relevant": 0}, "provider_status": {"status": "available"}}


def test_full_universe_and_sectors_recover_then_volume_warms_without_300_second_delay(monkeypatch):
    from quantplus_intelligence import market, market_data
    now, clock = [NOW], [0]
    monkeypatch.setattr(market_data, "utcnow", lambda: now[0])
    monkeypatch.setattr(market, "utcnow", lambda: now[0])
    monkeypatch.setattr(market_data, "time", SimpleNamespace(monotonic=lambda: clock[0]))
    monkeypatch.setattr(config, "stream_warm_wait_seconds", 0)

    async def scenario():
        data, shared = Data(Feed(now)), MemoryCache(clock=lambda: clock[0])
        collector = MarketSnapshotCollector(data, shared)
        engine = MarketEngine(data, News(), shared, InMemorySentimentHistoryRepository(), collector)
        for step in range(4):
            result = await engine.sentiment()
            assert result["components"]["market_breadth"]["observed"] == 50
            assert result["components"]["sector_breadth"]["observed"] == 8
            assert result["components"]["india_vix"]["available"]
            assert result["collector"]["history_loads"] <= 6
            assert not any("1-minute candles" in warning for warning in result["warnings"])
            if step == 0:
                assert not result["components"]["volume_momentum"]["available"]
                assert result["data_quality"] != "GOOD"
                assert "baseline warmup" in result["components"]["volume_momentum"]["reason"]
            clock[0] += 46
            now[0] += timedelta(seconds=46)
        assert result["components"]["volume_momentum"]["available"]
        assert result["components"]["volume_momentum"]["sample_size"] >= 10
        assert len(data.history_calls) == 24
        assert len(set(data.history_calls)) == 24
        assert len(data.feed.calls) == 4
        assert all(len(symbols) == 50 for symbols, _ in data.feed.calls)

    asyncio.run(scenario())


def test_breadth_reason_names_the_actual_coverage_requirement():
    result = breadth({"HDFCBANK": {"change_pct": -1}}, 50)
    assert result["score"] is None
    assert result["reason"] == "Fresh directional quotes 1/50; at least 40 required"


def test_closed_scheduler_releases_only_the_sentiment_owner():
    from quantplus_intelligence.scheduler import SentimentSnapshotScheduler

    async def scenario():
        feed = Feed([NOW])
        data = ExistingMarketData(feed)

        async def closed():
            return "closed"

        data.session = closed
        scheduler = SentimentSnapshotScheduler(SimpleNamespace(data=data))
        assert await scheduler.run_once() is None
        assert feed.released and feed.calls == [([], "closed")]

    asyncio.run(scenario())
