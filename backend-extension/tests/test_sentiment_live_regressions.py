"""Hermetic reproductions of live-session and News & Drivers boundary failures."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest

from quantplus_intelligence.cache import MemoryCache
from quantplus_intelligence.config import config
from quantplus_intelligence.history import InMemorySentimentHistoryRepository
from quantplus_intelligence.market import MarketEngine
from quantplus_intelligence.market_data import ExistingMarketData, MarketSnapshotCollector, quote_valid
from quantplus_intelligence.news.aggregation import aggregate
from quantplus_intelligence.news.official import normalize_rows
from quantplus_intelligence.news.provider import ProviderResult
from quantplus_intelligence.news.registry import ConnectorRegistry
from quantplus_intelligence.news.resolver import resolve
from quantplus_intelligence.news.service import NewsService
from quantplus_intelligence.volume import analyze_volume

NOW = datetime(2026, 10, 19, 6, 30, tzinfo=timezone.utc)  # Monday, noon IST


def quote(**changes):
    return {"source": "fyers", "price": 102, "open": 100, "change_pct": 2,
            "volume": 200, "as_of": NOW.isoformat(), **changes}


def headline(title="Infosys net profit rises", **changes):
    return {"id": title, "title": title, "provider": "fixture_news", "source": "Reuters",
            "url": "https://news.google.com/rss/articles/fixture", "snippet": "",
            "published_at": (NOW - timedelta(minutes=5)).isoformat(), **changes}


@pytest.fixture(autouse=True)
def isolated_news(monkeypatch):
    from quantplus_intelligence import market, market_data
    from quantplus_intelligence.news import aggregation, impact, relevance, service

    for module in (market, market_data, aggregation, impact, relevance, service):
        monkeypatch.setattr(module, "utcnow", lambda: NOW)
    monkeypatch.setattr(service, "registry", ConnectorRegistry())
    monkeypatch.setattr(service, "resolve", lambda value: resolve(value, []))
    monkeypatch.setattr(config, "news_archive_path", "")


class Feed:
    name = "fixture_news"

    def __init__(self, articles=(), status="available"):
        self.articles, self.status = list(articles), status
        self.calls = 0

    async def search(self, query, limit):
        self.calls += 1
        return ProviderResult(self.articles[:limit], status=self.status, provider=self.name)


class StockData:
    def __init__(self, session="open", value=None):
        self.session, self.value = session, value

    async def stock(self, symbol):
        return {"quote": self.value, "market_session": self.session,
                "data_quality": "GOOD" if self.session and self.value else "DEGRADED"}


@pytest.mark.parametrize("session", ["open", "closed", None])
def test_unknown_session_does_not_relax_live_quote_freshness(session):
    value = quote(as_of=(NOW - timedelta(hours=2)).isoformat())
    assert quote_valid(value, session, NOW) is (session == "closed")


def test_stock_quote_cache_follows_provider_session_transitions(monkeypatch):
    from quantplus_intelligence import market_data

    async def scenario():
        clock = [0]
        monkeypatch.setattr(market_data, "cache", MemoryCache(clock=lambda: clock[0]))

        class Data(ExistingMarketData):
            state = "closed"
            calls = 0

            async def session(self):
                return self.state

            async def equities(self, symbols, session):
                self.calls += 1
                return {"INFY": quote(price=100 if session == "closed" else 102)}

        data = Data()
        closed = await data.stock("INFY")
        data.state = "open"
        opened = await data.stock("INFY")
        again = await data.stock("INFY")
        assert closed["market_session"] == "closed"
        assert opened["market_session"] == "open"
        assert opened["quote"]["price"] == 102
        assert again is opened and data.calls == 2

    asyncio.run(scenario())


def test_market_and_volume_caches_do_not_cross_provider_sessions(monkeypatch):
    from quantplus_intelligence import market

    async def scenario():
        clock = [0]
        data = SimpleNamespace(state="closed")

        async def session():
            return data.state

        data.session = session

        class Collector:
            calls = 0

            async def snapshot(self):
                self.calls += 1
                return {"session": data.state, "indices": {"NIFTY": quote()},
                        "quotes": {"INFY": quote()}, "history_by_symbol": {}, "collector": {}}

        collector = Collector()
        volume_calls = []

        def volume(quotes, daily, intraday, session=None):
            volume_calls.append(data.state)
            return {"score": None if data.state == "closed" else 75, "confidence": .8}

        monkeypatch.setattr(market, "analyze_volume", volume)
        engine = MarketEngine(data, NewsService(Feed(), MemoryCache()),
                              MemoryCache(clock=lambda: clock[0]), InMemorySentimentHistoryRepository(), collector)
        closed = await engine.sentiment()
        data.state = "open"
        opened = await engine.sentiment()
        again = await engine.sentiment()
        assert closed["market_session"] == "closed" and closed["score"] is None
        assert opened["market_session"] == "open" and opened["score"] > 50
        assert opened["score_basis"] == "CURRENT_MARKET_DATA"
        assert opened["components"]["volume_momentum"]["score"] == 75
        assert again is opened and collector.calls == 2
        assert volume_calls == ["closed", "open"]

    asyncio.run(scenario())


@pytest.mark.parametrize("available", [True, False])
def test_collector_uses_bounded_fyers_baselines_instead_of_display_history(monkeypatch, available):
    monkeypatch.setattr(config, "snapshot_history_calls", 2)

    class Data:
        calls = []

        async def session(self):
            return "open"

        async def universe(self):
            return {"symbols": ["INFY"]}

        async def equities(self, symbols, session):
            return {"INFY": quote()}

        async def indices(self, session):
            return {}

        async def index_history(self, name):
            return {"candles": []}

        async def stock_history(self, *args):
            pytest.fail("Display history truncates 1D to today's bars and may fall back to Yahoo")

        async def sentiment_history(self, symbol, intraday=False):
            self.calls.append((symbol, intraday))
            if not available:
                return {"source": "unavailable", "candles": []}
            if intraday:
                candles = [{"time": (datetime(2026, 10, day, 3, 45, tzinfo=timezone.utc) + timedelta(minutes=minute)).timestamp(),
                            "close": 100, "volume": 1}
                           for day in (12, 13, 14, 15, 16) for minute in range(0, 375, 5)]
            else:
                candles = [{"time": (NOW - timedelta(days=day)).timestamp(), "close": 100, "volume": 75}
                           for day in range(1, 21)]
            return {"source": "fyers", "interval": "5m" if intraday else "1d",
                    "candles": candles}

    async def scenario():
        data = Data()
        collector = MarketSnapshotCollector(data, MemoryCache())
        first = await collector.snapshot()
        await collector.snapshot()
        assert data.calls == [("INFY", False), ("INFY", True)]
        assert first["collector"]["history_loads"] == 2
        result = analyze_volume(first["quotes"], first["history_by_symbol"], first["intraday_by_symbol"], minimum=1)
        if available:
            assert result["baseline_methods"] == ["EQUIVALENT_TIME_OF_DAY"]
            assert result["observations"]["INFY"]["baseline_sessions"] == 5
            assert result["score"] > 50
        else:
            assert result["score"] is None and result["sample_size"] == 0

    asyncio.run(scenario())


def test_explicitly_unscored_headlines_never_enter_aggregation_or_drivers():
    scored = {**headline(), "relevance_score": 90, "impact_score": 80, "impact": "high",
              "confidence": .8, "sentiment_score": 75, "sentiment": "positive"}
    excluded = {**scored, "id": "excluded", "influences_sentiment": False,
                "sentiment_score": 10, "sentiment": "negative"}
    only = aggregate([excluded], "INFY", now=NOW)
    mixed = aggregate([scored, excluded], "INFY", now=NOW)
    assert only["score"] is None and only["label"] == "UNAVAILABLE"
    assert only["top_drivers"] == [] and only["negative_articles"] == 0
    assert mixed["score"] == 75 and mixed["positive_articles"] == 1
    assert [a["id"] for a in mixed["top_drivers"]] == [scored["id"]]


def test_unsupported_script_is_unavailable_not_neutral_in_stock_news_and_summary():
    async def scenario():
        service = NewsService(Feed([headline("Infosys के शेयर चढ़े")]), MemoryCache(), StockData("open", quote()))
        news = await service.stock_news("INFY")
        result = await service.stock_sentiment("INFY")
        [item] = news["articles"]
        assert item["influences_sentiment"] is False
        assert item["sentiment_score"] is None and item["sentiment"] == "unavailable"
        assert item["confidence"] == 0
        assert news["provider_status"]["status"] == "available"
        assert news["counts"]["relevant"] == 0
        assert result["score"] is None and result["label"] == "UNAVAILABLE"
        assert result["neutral_articles"] == 0 and result["top_drivers"] == []

    asyncio.run(scenario())


@pytest.mark.parametrize("session,status", [(None, "unavailable_market_session"), ("closed", "unavailable_market_closed")])
def test_stock_price_confirmation_requires_a_verified_open_session(session, status):
    async def scenario():
        service = NewsService(Feed([headline()]), MemoryCache(), StockData(session, quote(change_pct=-2)))
        result = await service.stock_sentiment("INFY")
        assert result["score"] > 60
        assert result["price_confirmation"] is None and not result["news_price_divergence"]
        assert result["price_confirmation_status"] == status

    asyncio.run(scenario())


def test_stock_price_confirmation_compares_instants_not_timestamp_strings():
    async def scenario():
        # 11:30 IST is 06:00 UTC: news predates the 06:30 UTC quote.
        service = NewsService(Feed([headline(published_at="2026-10-19T11:30:00+05:30")]),
                              MemoryCache(), StockData("open", quote()))
        result = await service.stock_sentiment("INFY")
        assert result["price_confirmation"] is True
        assert result["price_confirmation_status"] == "daily_direction_proxy"

    asyncio.run(scenario())


def test_official_generic_headline_retains_verified_issuer_for_news_drivers():
    async def scenario():
        items, quarantined = normalize_rows("INFY", [
            {"symbol": "INFY", "headline": "Financial Results", "an_dt": "19-Oct-2026 11:55:00"},
            {"symbol": "TCS", "headline": "Other issuer", "an_dt": "19-Oct-2026 11:55:00"},
        ], 10, NOW)
        assert len(items) == 1 and items[0]["issuer_symbol"] == "INFY"
        assert quarantined[0]["reason"] == "ISSUER_MISMATCH"
        service = NewsService(Feed(items), MemoryCache())
        result = await service.stock_news("INFY")
        [item] = result["articles"]
        assert item["influences_sentiment"] is True
        assert item["relevance_score"] >= config.relevance_threshold
        assert item["title"] == "Financial Results"  # Preserve the provider's headline.

        # Query metadata alone must not promote unrelated RSS headlines.
        from quantplus_intelligence.news.relevance import relevance
        assert relevance({**headline("Financial Results"), "issuer_symbol": "INFY"}, resolve("INFY", []), NOW) == 0
        unverified, _ = normalize_rows("INFY", [
            {"headline": "Financial Results", "an_dt": "19-Oct-2026 11:55:00"},
        ], 10, NOW)
        assert unverified[0]["issuer_symbol"] is None
        assert relevance(unverified[0], resolve("INFY", []), NOW) == 0

    asyncio.run(scenario())


def test_partial_market_news_is_not_reported_as_a_total_provider_outage():
    async def scenario():
        async def session():
            return "open"

        class Collector:
            async def snapshot(self):
                return {"session": "open", "indices": {"NIFTY": quote()}, "collector": {}}

        class News:
            async def market_news(self):
                articles = [{**headline(f"Indian stock market profit rises {i}"), "relevance_score": 90,
                             "sentiment_score": 75, "sentiment": "positive", "confidence": .8,
                             "impact_score": 80, "impact": "high"} for i in range(3)]
                return {"articles": articles, "counts": {"relevant": 3},
                        "provider_status": {"status": "partial"}, "updated_at": NOW.isoformat()}

        engine = MarketEngine(SimpleNamespace(session=session), News(), MemoryCache(),
                              InMemorySentimentHistoryRepository(), Collector())
        result = await engine.sentiment()
        assert result["components"]["news_sentiment"]["available"] is True
        assert "Market news provider coverage is partial" in result["warnings"]
        assert not any("uses market data only" in warning for warning in result["warnings"])

    asyncio.run(scenario())


@pytest.mark.parametrize("status", ["available", "unavailable"])
def test_news_and_sentiment_http_apis_preserve_empty_provider_truth(monkeypatch, status):
    from fastapi import FastAPI
    from quantplus_intelligence import api

    async def scenario():
        feed = Feed(status=status)
        service = NewsService(feed, MemoryCache(), StockData())
        monkeypatch.setattr(api, "news_service", service)
        app = FastAPI()
        app.include_router(api.router, prefix="/api/v1")
        app.dependency_overrides[api.website_auth] = lambda: None
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://fixture") as client:
            news = await client.get("/api/v1/stocks/INFY/news")
            sentiment = await client.get("/api/v1/stocks/INFY/news-sentiment")
            assert news.status_code == sentiment.status_code == 200
            assert news.json()["articles"] == []
            result = sentiment.json()
            assert result["score"] is None and result["label"] == "UNAVAILABLE"
            assert result["provider_status"]["status"] == status
            assert feed.calls == 1

    asyncio.run(scenario())


# 2026-10-27 22:50 IST: five days after the FYERS probe, a closed-market
# collection scored breadth 5/50 although every REST row carried the session
# stamp. FYERS stamps daily candles and closed-session REST rows at the same
# UTC-midnight epoch of the trading date, so the loaded index daily history is
# the verifier for a closed-session row's direction.
STAMP = 1793059200  # 2026-10-27T00:00:00Z
SESSION_ROW = {"source": "fyers", "price": 1196.2, "previous_close": 1201.8,
               "change_pct": -0.47, "open": 1195, "volume": 13067787,
               "as_of": "2026-10-27T00:00:00+00:00"}


def test_closed_session_direction_accepts_rest_row_and_session_ticks():
    from quantplus_intelligence.market import closed_session_direction

    assert closed_session_direction(SESSION_ROW, STAMP)
    # The last live tick of the completed session is also a session observation.
    tick = {**SESSION_ROW, "as_of": "2026-10-27T09:59:00+00:00", "change_pct": .9}
    assert closed_session_direction(tick, STAMP)
    # A tick between 15:30 IST and the next session, or from an earlier session,
    # or a pre-open row stamped at the next calendar date, must not score.
    assert not closed_session_direction({**SESSION_ROW, "as_of": "2026-10-27T10:01:00+00:00"}, STAMP)
    assert not closed_session_direction({**SESSION_ROW, "as_of": "2026-10-26T09:59:00+00:00"}, STAMP)
    assert not closed_session_direction({**SESSION_ROW, "as_of": "2026-10-28T00:00:00+00:00"}, STAMP)
    assert not closed_session_direction({**SESSION_ROW, "source": "yahoo"}, STAMP)
    assert not closed_session_direction(SESSION_ROW, None)
    assert not closed_session_direction({**SESSION_ROW, "change_pct": None}, STAMP)


def test_last_completed_session_stamp_prefers_nifty_daily_candles():
    from quantplus_intelligence.market import last_completed_session_stamp

    nifty = {"source": "fyers", "candles": [{"time": STAMP - 86400}, {"time": STAMP}]}
    assert last_completed_session_stamp({"NIFTY": nifty}) == STAMP
    bank = {"source": "fyers", "candles": [{"time": STAMP}]}
    assert last_completed_session_stamp({"NIFTY": {"source": "fyers", "candles": []}, "BANK": bank}) == STAMP
    assert last_completed_session_stamp({}) is None
    assert last_completed_session_stamp({"NIFTY": {"source": "unavailable", "candles": [{"time": STAMP}]}}) is None


def closed_engine(monkeypatch, market, rows):
    """A closed-market MarketEngine whose quotes are the given closed rows."""
    clock = [0]
    data = SimpleNamespace()

    async def session():
        return "closed"

    data.session = session
    volume_calls = []

    def volume_stub(quotes, daily, intraday, minimum=None, session=None):
        volume_calls.append({"session": session, "quotes": len(quotes), "baselines": len(daily)})
        return {"score": None, "confidence": 0, "sample_size": 0,
                "required_samples": 10, "available": False}

    class Collector:
        async def snapshot(self):
            return {"session": "closed", "membership": {"symbols": ["A", "B", "C", "D", "E"], "industries": {},
                                                         "source": "official-fixture"},
                    "quotes": {name: dict(row) for name, row in zip(("A", "B", "C", "D", "E"), rows)},
                    "indices": {"NIFTY": dict(rows[0]), "BANK": dict(rows[1])},
                    "index_histories": {"NIFTY": {"source": "fyers", "candles": [
                        {"time": STAMP - 86400, "open": 23146, "close": 23146},
                        {"time": STAMP, "open": 22780, "close": 22749.75}]},
                        "BANK": {"source": "fyers", "candles": []}},
                    "vix_history": {"candles": []}, "nifty_history": {"candles": []},
                    "history_by_symbol": {}, "intraday_by_symbol": {},
                    "diagnostics": {}, "collector": {}}

    monkeypatch.setattr(market, "utcnow", lambda: datetime(2026, 10, 27, 17, 20, tzinfo=timezone.utc))
    monkeypatch.setattr(market, "analyze_volume", volume_stub)
    engine = MarketEngine(data, NewsService(Feed(), MemoryCache()), MemoryCache(clock=lambda: clock[0]),
                          InMemorySentimentHistoryRepository(), Collector())
    return engine, volume_calls


def test_closed_volume_pairs_completed_session_volume_with_daily_baseline():
    from quantplus_intelligence.volume import analyze_volume

    closed_quote = {**SESSION_ROW, "volume": 13067787}
    daily = {"source": "fyers", "interval": "1d", "candles": [
        {"time": (datetime.fromtimestamp(STAMP, timezone.utc) - timedelta(days=day)).timestamp(),
         "close": 100, "volume": 10_000_000} for day in range(1, 21)]}
    result = analyze_volume({"RELIANCE": closed_quote}, {"RELIANCE": daily}, session="closed")
    assert result["sample_size"] == 1
    assert result["observations"]["RELIANCE"]["baseline_method"] == "DAILY_AVERAGE"
    assert result["observations"]["RELIANCE"]["relative_volume"] == pytest.approx(1.3067787)
    # The old stamp-derived elapsed (05:30 IST, before the session) rejected the pair.
    assert analyze_volume({"RELIANCE": closed_quote}, {"RELIANCE": daily})["sample_size"] == 0


def test_closed_breadth_scores_rest_rows_stamped_at_the_completed_session(monkeypatch):
    from quantplus_intelligence import market

    async def scenario():
        rows = [dict(SESSION_ROW, change_pct=change) for change in (.9, -.47, .5, -.3, 2)]
        engine, volume_calls = closed_engine(monkeypatch, market, rows)
        result = await engine.sentiment()
        breadth = result["components"]["market_breadth"]
        assert breadth["observed"] == 5 and breadth["score"] is not None
        assert breadth["advancing"] == 3 and breadth["declining"] == 2
        assert "market_breadth unavailable" not in result["warnings"]
        # The stamped NIFTY daily candles still rebuild the index quote itself.
        assert result["components"]["nifty_momentum"]["score"] is not None
        assert result["score"] is not None and result["market_session"] == "closed"
        # The volume calculation receives the session, so closed rows pair with
        # their daily baselines at the completed session's close.
        assert volume_calls and volume_calls[0] == {"session": "closed", "quotes": 5, "baselines": 0}

    asyncio.run(scenario())


def test_closed_breadth_rejects_rows_not_stamped_at_the_completed_session(monkeypatch):
    from quantplus_intelligence import market

    async def scenario():
        foreign = [dict(SESSION_ROW, as_of="2026-10-26T00:00:00+00:00", change_pct=1) for _ in range(5)]
        engine, _ = closed_engine(monkeypatch, market, foreign)
        result = await engine.sentiment()
        breadth = result["components"]["market_breadth"]
        assert breadth["observed"] == 0 and breadth["score"] is None
        assert breadth["reason"] == "Fresh directional quotes 0/5; at least 4 required"

        async def no_history_session():
            return "closed"

        # Without any FYERS index daily history there is no verifier at all.
        class Collector:
            async def snapshot(self):
                return {"session": "closed", "index_histories": {}, "quotes": {},
                        "indices": {}, "history_by_symbol": {}, "intraday_by_symbol": {},
                        "vix_history": {}, "nifty_history": {}, "diagnostics": {},
                        "membership": {"symbols": [], "industries": {}}, "collector": {}}

        engine = MarketEngine(SimpleNamespace(session=no_history_session), NewsService(Feed(), MemoryCache()),
                              MemoryCache(), InMemorySentimentHistoryRepository(), Collector())
        monkeypatch.setattr(market, "analyze_volume",
                            lambda *args, **kwargs: {"score": None, "confidence": 0, "sample_size": 0,
                                                     "required_samples": 10, "available": False})
        result = await engine.sentiment()
        assert result["components"]["market_breadth"]["score"] is None

    asyncio.run(scenario())
