from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from pydantic import ValidationError

from quantplus_intelligence.cache import MemoryCache
from quantplus_intelligence.common import label
from quantplus_intelligence.config import IntelligenceSettings, config
from quantplus_intelligence.news.resolver import normalize_symbol, resolve, Company
from quantplus_intelligence.news.google_news import GoogleNewsProvider
from quantplus_intelligence.news.provider import ProviderResult
from quantplus_intelligence.news.deduplicator import deduplicate
from quantplus_intelligence.news.relevance import relevance
from quantplus_intelligence.news.sentiment import analyze, category
from quantplus_intelligence.news.impact import impact
from quantplus_intelligence.news.aggregation import aggregate, article_weight
from quantplus_intelligence.news.service import NewsService
from quantplus_intelligence.market import weighted_calculation, breadth, momentum, vix_sentiment, regime, MarketEngine
from quantplus_intelligence.market_data import quote_valid
from quantplus_intelligence.explanation import Explanation, grounded_explanation, explanation_key

NOW = datetime.now(timezone.utc)


def article(title="Reliance Industries reports record net profit", **overrides):
    return {"id": title, "title": title, "source": "Reuters", "url": "https://news.google.com/rss/articles/test",
            "published_at": NOW.isoformat(), "snippet": "", "provider": "test", "symbol": "RELIANCE",
            "company": "Reliance Industries", "relevance_score": 90, "sentiment": "positive",
            "sentiment_score": 75, "impact": "high", "impact_score": 80, "category": "earnings", "confidence": .8,
            **overrides}


@pytest.mark.parametrize("raw,expected", [(" reliance.ns ", "RELIANCE"), ("NSE:TCS-EQ", "TCS"),
    ("M&M", "M&M"), ("infy", "INFY")])
def test_symbol_normalization(raw, expected):
    assert normalize_symbol(raw) == expected


@pytest.mark.parametrize("raw", ["../env", "A/B", "", "A?key=x", "A" * 31])
def test_invalid_symbol(raw):
    with pytest.raises(ValueError):
        normalize_symbol(raw)


def test_query_generation_metadata_and_fallback():
    assert resolve("INFY", []).query == "Infosys NSE"
    assert resolve("ABC", [{"symbol": "ABC", "company": "Example Industries Limited", "sector": "Technology"}]).query == "Example Industries ABC NSE stock"
    assert resolve("XYZ", []).query == "XYZ XYZ NSE stock"


def test_deduplication_preserves_distinct_developments():
    a = article("Infosys net profit rises 12 percent in quarterly results")
    b = article("Infosys net profit rises 12 percent in quarterly results!", id="b", source="Mint")
    c = article("Infosys net profit falls 12 percent in quarterly results", id="c")
    d = article("Infosys net profit rises 20 percent in quarterly results", id="d")
    assert len(deduplicate([a, b, c, d])) == 3


def test_relevance_company_symbol_brand_age_and_unrelated():
    company = resolve("RELIANCE", [])
    assert relevance(article(), company, NOW) >= 80
    assert relevance(article("Jio wins a major contract"), company, NOW) >= 55
    assert relevance(article("Reliance Power signs a deal"), company, NOW) < 55
    assert relevance(article("Weather improves in Delhi"), company, NOW) == 0
    older = article(published_at=(NOW-timedelta(hours=36)).isoformat())
    assert relevance(older, company, NOW) < relevance(article(), company, NOW)
    assert relevance(article("ALT solution wins deal"), Company("LT", "Larsen & Toubro", ""), NOW) < 55


def test_stock_perspective_oil():
    text = article("Oil prices fall sharply")
    assert analyze(text, resolve("INDIGO", []))["sentiment"] == "positive"
    assert analyze(text, resolve("ONGC", []))["sentiment"] == "negative"
    assert analyze(text, resolve("RELIANCE", []))["sentiment"] == "neutral"


def test_low_confidence_shrinks_and_conflicts():
    company = resolve("INFY", [])
    realised = analyze(article("Infosys shares surge after profit jumps"), company)
    speculation = analyze(article("Could Infosys shares surge after profit jumps?"), company)
    assert speculation["confidence"] < realised["confidence"]
    assert abs(speculation["sentiment_score"] - 50) < abs(realised["sentiment_score"] - 50)
    assert analyze(article("Infosys profit jumps but shares fall"), company)["confidence"] < realised["confidence"]


@pytest.mark.parametrize("title,expected", [("Infosys quarterly results", "earnings"),
    ("Infosys wins a major order", "order/deal"), ("SEBI fraud probe", "fraud/governance"),
    ("Dividend announced", "dividend"), ("Infosys acquires a company", "merger/acquisition")])
def test_category(title, expected):
    assert category(title.lower()) == expected


def test_impact_event_source_recency():
    strong = impact(article(), now=NOW)
    weak = impact(article(source="Unknown", category="other", published_at=(NOW-timedelta(hours=36)).isoformat()), now=NOW)
    assert strong["impact_score"] > weak["impact_score"]
    assert strong["impact"] == "high"


def test_recency_decay_half_life():
    a = article()
    old = article(published_at=(NOW-timedelta(hours=config.news_half_life_hours)).isoformat())
    assert article_weight(old, NOW) == pytest.approx(article_weight(a, NOW)/2)


def test_impact_weight_and_aggregate_not_simple_average():
    high = article(sentiment_score=90, impact_score=95)
    low = article(id="negative", title="Different negative development", sentiment_score=10, impact_score=5, sentiment="negative")
    assert aggregate([high, low], "RELIANCE", now=NOW)["score"] > 65
    assert article_weight(high, NOW) > article_weight(low, NOW)


def test_irrelevant_and_no_news_never_fake_neutral():
    assert aggregate([], "INFY")["score"] is None
    assert aggregate([article(relevance_score=0)], "INFY")["score"] is None
    assert aggregate([], "INFY")["confidence"] == 0


def test_market_article_dominance_cap():
    inputs = [article(id=str(i), sentiment_score=50, confidence=.4, impact_score=20) for i in range(10)]
    inputs.append(article(id="dominant", sentiment_score=100, confidence=1, impact_score=100))
    assert aggregate(inputs, "MARKET", now=NOW, market=True)["score"] <= 68


@pytest.mark.parametrize("score,expected", [(19, "EXTREME_BEARISH"), (20, "EXTREME_BEARISH"),
    (21, "BEARISH"), (40, "BEARISH"), (41, "NEUTRAL"), (59, "NEUTRAL"),
    (60, "BULLISH"), (79, "BULLISH"), (80, "EXTREME_BULLISH")])
def test_classification_boundaries(score, expected):
    assert label(score, market=True) == expected


def components(scores=None):
    scores = scores or {}
    return {key: {"score": scores.get(key), "confidence": .8} for key in config.market_weights}


def test_weighted_calculation_and_missing_renormalization():
    all_components = {k: {"score": 80 if k == "nifty_momentum" else 50, "confidence": 1} for k in config.market_weights}
    assert weighted_calculation(all_components)["score"] == 56
    output = weighted_calculation(components({"nifty_momentum": 80, "market_breadth": 20}))
    assert output["score"] == 50
    assert output["confidence"] == pytest.approx(.32)
    assert output["components"]["india_vix"]["score"] is None
    assert output["components"]["india_vix"]["effective_weight"] == 0
    assert sum(c["effective_weight"] for c in output["components"].values()) == pytest.approx(1)
    assert weighted_calculation(components())["score"] is None
    assert weighted_calculation(components({"news_sentiment": 90}))["score"] is None


def test_weights_validated():
    assert sum(config.market_weights.values()) == pytest.approx(1)
    invalid = dict(config.market_weights, nifty_momentum=.4)
    with pytest.raises((ValueError, ValidationError)):
        IntelligenceSettings(market_weights=invalid)
    with pytest.raises((ValueError, ValidationError)):
        IntelligenceSettings(market_weights={"x": 1})


def test_breadth_counts_and_coverage():
    qs = {str(i): {"change_pct": change} for i, change in enumerate([1, 1, -1, 0])}
    result = breadth(qs, 4)
    assert (result["advancing"], result["declining"], result["unchanged"]) == (2, 1, 1)
    assert result["score"] == 62.5
    assert breadth(qs, 50)["score"] is None


def test_momentum_and_vix_direction():
    assert momentum({"price": 105, "open": 100, "change_pct": 2}) > 50
    assert momentum(None) is None
    q = {"price": 20, "change_pct": 5, "as_of": NOW.isoformat()}
    assert vix_sentiment(q, {"candles": []})["score"] < 50
    q["change_pct"] = -5
    assert vix_sentiment(q, {"candles": []})["score"] > 50


def test_reject_stale_delayed_and_future_quotes():
    q = {"price": 100, "source": "fyers", "as_of": NOW.isoformat()}
    assert quote_valid(q, "open", NOW)
    assert not quote_valid({**q, "source": "yahoo"}, "open", NOW)
    assert not quote_valid({**q, "as_of": (NOW-timedelta(hours=2)).isoformat()}, "open", NOW)
    assert quote_valid({**q, "as_of": (NOW-timedelta(days=2)).isoformat()}, "closed", NOW)
    assert not quote_valid({**q, "as_of": (NOW+timedelta(hours=2)).isoformat()}, "closed", NOW)


def test_cache_single_flight_ttl_capacity_and_failure_retry():
    async def scenario():
        now = [0]
        cache = MemoryCache(max_entries=2, clock=lambda: now[0])
        calls = [0]
        async def load():
            calls[0] += 1
            await asyncio.sleep(.001)
            return {"value": calls[0]}
        results = await asyncio.gather(*(cache.get_or_load("same", 600, load) for _ in range(20)))
        assert calls[0] == 1 and all(r["value"] == 1 for r in results)
        now[0] = 601
        assert (await cache.get_or_load("same", 600, load))["value"] == 2
        await cache.get_or_load("two", 600, load)
        await cache.get_or_load("three", 600, load)
        assert len(cache.values) == 2 and not cache.pending
        async def failure():
            return {"data_quality": "DEGRADED"}
        await cache.get_or_load("failed", 600, failure)
        assert cache.values["failed"][0] == 601 + config.failure_ttl_seconds
    asyncio.run(scenario())


def test_google_rss_real_schema_and_locale_no_article_fetch():
    calls = []
    from email.utils import format_datetime
    xml = f'''<rss><channel><item><title>Infosys profits rise - Reuters</title><link>https://news.google.com/rss/articles/abc</link>
    <pubDate>{format_datetime(NOW)}</pubDate><source>Reuters</source><description>&lt;b&gt;Short headline&lt;/b&gt;</description></item></channel></rss>'''
    def handler(request):
        calls.append(request)
        return httpx.Response(200, text=xml)
    result = asyncio.run(GoogleNewsProvider(httpx.MockTransport(handler)).search("Infosys NSE"))
    assert len(calls) == 1 and calls[0].url.host == "news.google.com"
    assert calls[0].url.params["hl"] == "en-IN" and calls[0].url.params["gl"] == "IN"
    assert "when:1d" in calls[0].url.params["q"]
    assert result.articles[0]["title"] == "Infosys profits rise"
    assert result.articles[0]["snippet"] == "Short headline"
    assert result.articles[0]["published_at"].endswith("+00:00")


@pytest.mark.parametrize("response", [httpx.Response(503), httpx.Response(200, text="not xml"),
    httpx.Response(200, text='<!DOCTYPE rss [<!ENTITY x "x">]><rss/>'), httpx.Response(200, text="<html/>")])
def test_rss_provider_fails_safe(response):
    result = asyncio.run(GoogleNewsProvider(httpx.MockTransport(lambda r: response)).search("test"))
    assert result.status == "unavailable" and result.articles == []


def test_news_service_cache_and_arbitrary_provider_failure():
    class Provider:
        name = "mock"
        calls = 0
        async def search(self, query, limit):
            self.calls += 1
            return ProviderResult([article()], provider="mock")
    async def scenario():
        provider = Provider()
        service = NewsService(provider, MemoryCache())
        first, second = await asyncio.gather(service.stock_news("RELIANCE"), service.stock_news("RELIANCE.NS"))
        assert provider.calls == 1
        assert first is second and first["articles"][0]["influences_sentiment"]
        async def fail(query, limit):
            raise RuntimeError("secret-in-provider-error")
        provider.search = fail
        failure = await service.stock_news("TCS")
        assert failure["articles"] == [] and failure["data_quality"] == "DEGRADED"
        assert "secret-in-provider-error" not in str(failure)
    asyncio.run(scenario())


def test_explanation_cannot_override_score():
    with pytest.raises(ValidationError):
        Explanation.model_validate({"headline": "Test", "summary": "Test", "drivers": [], "risks": [], "score": 99})


def test_ai_numerical_claims_and_unknown_evidence_rejected():
    import json
    context = {"components": {"india_vix": {"score": 44.18, "available": True, "confidence": .85,
                                           "effective_weight": .16, "change_pct": .0696}}}
    raw = {"headline": "Mixed market tone", "summary": "Volatility offsets momentum.",
           "drivers": ["india_vix"], "risks": []}
    result = grounded_explanation(json.dumps(raw), context)
    assert "+0.070%" in result["drivers"][0]
    with pytest.raises(ValueError):
        grounded_explanation(json.dumps({**raw, "summary": "VIX rose 6.96%."}), context)
    with pytest.raises(ValueError):
        grounded_explanation(json.dumps({**raw, "risks": ["invented_event"]}), context)


def test_explanation_cache_not_invalidated_by_confidence_decay_or_calculation_time():
    a = {"score": 52, "label": "NEUTRAL", "confidence": .66, "updated_at": NOW.isoformat(),
         "components": {"news_sentiment": {"score": 43, "available": True, "confidence": .3}}}
    b = {**a, "updated_at": "later", "confidence": .65,
         "components": {"news_sentiment": {"score": 43, "available": True, "confidence": .29}}}
    assert explanation_key(a) == explanation_key(b)
    assert explanation_key(a) != explanation_key({**b, "score": 60})


@pytest.mark.parametrize("exchange,segment,state,expected", [(10, 10, "CTS_CLOSE", "closed"),
    (10, 10, "OPEN", "open"), ("NSE", "CM", "CLOSED", "closed")])
def test_existing_fyers_session_numeric_and_textual_identifiers(exchange, segment, state, expected):
    # The installer applies exactly this compatibility fix to the existing service.
    from app.data.fyers_provider import FyersData
    data = FyersData()
    async def get(path):
        return {"marketStatus": [{"exchange": exchange, "segment": segment, "market_type": "NORMAL", "status": state}]}
    data.get = get
    assert asyncio.run(data.session()) == expected


def test_market_fyers_failure_news_survives_but_not_fake_index():
    class Data:
        async def session(self): return None
        async def universe(self): return {"symbols": [], "source": None, "updated_at": NOW.isoformat()}
        async def indices(self, session): return {}
        async def index_history(self, name): return {"candles": []}
    class News:
        async def market_news(self):
            return {"articles": [article(id=str(i)) for i in range(3)], "counts": {"relevant": 3},
                    "provider_status": {"status": "available"}, "updated_at": NOW.isoformat()}
    result = asyncio.run(MarketEngine(Data(), News(), MemoryCache()).sentiment())
    assert result["score"] is None and result["data_quality"] == "DEGRADED"
    assert result["important_news"] and result["components"]["india_vix"]["score"] is None


def test_market_news_failure_does_not_stop_fyers_score():
    class Data:
        async def session(self): return "open"
        async def universe(self): return {"symbols": [], "source": None, "updated_at": NOW.isoformat()}
        async def indices(self, session):
            return {"NIFTY": {"price": 105, "open": 100, "change_pct": 2, "as_of": NOW.isoformat()}}
        async def index_history(self, name): return {"candles": []}
    class News:
        async def market_news(self):
            return {"articles": [], "counts": {"relevant": 0}, "provider_status": {"status": "unavailable"},
                    "updated_at": NOW.isoformat()}
    result = asyncio.run(MarketEngine(Data(), News(), MemoryCache()).sentiment())
    assert result["score"] > 50 and result["confidence"] < .3
    assert result["components"]["news_sentiment"]["score"] is None
    assert result["components"]["nifty_momentum"]["effective_weight"] == 1
