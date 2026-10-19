"""Regressions from the bounded 2026-10-19 FYERS quote probe.

Only public market values are retained. All 14 REST rows carried the same UTC
midnight epoch string, not a usable intraday observation timestamp. Successful
authentication and recent receipt must not make these observations live.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from quantplus_intelligence.cache import MemoryCache
from quantplus_intelligence.config import INDEX_SYMBOLS, config
from quantplus_intelligence.market import weighted_calculation
from quantplus_intelligence.market_data import ExistingMarketData, quote_valid, raw_quote


OBSERVED = datetime(2026, 10, 19, 7, 29, 40, 13300, tzinfo=timezone.utc)
PROVIDER_TT = "1792368000"
PROVIDER_AS_OF = "2026-10-19T00:00:00+00:00"
CAPTURED = [
    ("HDFCBANK", 710.3, 728.85),
    ("RELIANCE", 1207.3, 1211.2),
    ("TCS", 2457.1, 2465.0),
    ("INFY", 1131.45, 1161.2),
    ("NIFTY", 22917.8, 23146.15),
    ("BANK", 55559.9, 55844.0),
    ("VIX", 14.75, 14.06),
    ("IT", 31495.9, 31924.1),
    ("AUTO", 25640.25, 25768.5),
    ("PHARMA", 25714.2, 25781.65),
    ("FMCG", 44048.0, 44616.15),
    ("METAL", 12117.8, 12133.2),
    ("ENERGY", 36046.5, 36190.85),
    ("REALTY", 817.6, 825.95),
]


def captured_rows():
    return {symbol: {"tt": PROVIDER_TT, "lp": price, "prev_close_price": previous}
            for symbol, price, previous in CAPTURED}


@pytest.mark.parametrize("symbol,price,previous", CAPTURED)
def test_captured_numeric_string_timestamp_parses_but_is_not_live(symbol, price, previous):
    value = raw_quote(symbol, {"tt": PROVIDER_TT, "lp": price, "prev_close_price": previous}, "open")
    assert value is not None, "The numeric string itself is supported"
    assert value["as_of"] == PROVIDER_AS_OF
    assert value["source"] == "fyers" and value["price"] == price
    assert value["market_session"] == "open"
    assert (OBSERVED - datetime.fromisoformat(value["as_of"])).total_seconds() == pytest.approx(26980.0133)
    assert not quote_valid(value, "open", OBSERVED)
    assert not quote_valid(value, None, OBSERVED)
    assert quote_valid(value, "closed", OBSERVED), "Preserve explicitly closed-session handling"


@pytest.mark.parametrize("representation", [int, float, str])
def test_actual_intraday_epoch_is_accepted_without_retiming(representation):
    timestamp = int((OBSERVED - timedelta(seconds=10)).timestamp())
    value = raw_quote("NIFTY", {"tt": representation(timestamp), "lp": 22917.8}, "open")
    assert value["as_of"] == datetime.fromtimestamp(timestamp, timezone.utc).isoformat()
    assert quote_valid(value, "open", OBSERVED)


@pytest.mark.parametrize("timestamp", [None, "", "not-a-timestamp"])
def test_missing_or_invalid_provider_time_never_uses_receipt_time(timestamp):
    assert raw_quote("NIFTY", {"tt": timestamp, "lp": 22917.8}, "open") is None


@pytest.mark.parametrize("fresh_stream_tick", [False, True])
def test_adapters_reject_captured_rest_rows_but_keep_real_fresh_stream_ticks(monkeypatch, fresh_stream_tick):
    from app.data.fyers_provider import fyers
    from app.data.live_market import market
    from quantplus_intelligence import market_data

    rows = captured_rows()
    equities = [symbol for symbol, _, _ in CAPTURED[:4]]
    calls = []

    async def snapshots(symbols):
        calls.append("equities")
        assert symbols == [s for s in equities if not (fresh_stream_tick and s == "HDFCBANK")]
        return {symbol: rows[symbol] for symbol in symbols}

    async def indices(path, params):
        if path == "history":
            calls.append("history")
            assert params["resolution"] == "1"
            assert params["symbol"] in {INDEX_SYMBOLS[name] for name in ("NIFTY", "BANK", "VIX")}
            return {"candles": []}
        calls.append("indices")
        assert path == "quotes" and params == {"symbols": ",".join(INDEX_SYMBOLS.values())}
        return {"s": "ok", "d": [{"s": "ok", "n": symbol, "v": rows[name]}
                                  for name, symbol in INDEX_SYMBOLS.items()]}

    monkeypatch.setattr(fyers, "snapshots", snapshots)
    monkeypatch.setattr(fyers, "get", indices)
    monkeypatch.setattr(market_data, "utcnow", lambda: OBSERVED)
    monkeypatch.setattr(market_data, "cache", MemoryCache())
    timestamp = int((OBSERVED - timedelta(seconds=5)).timestamp())
    stream = raw_quote("HDFCBANK", {**rows["HDFCBANK"], "tt": timestamp}, "open")
    monkeypatch.setattr(market, "fyers_quotes", {"HDFCBANK": stream} if fresh_stream_tick else {})

    async def scenario():
        data = ExistingMarketData()
        equity_quotes = await data.equities(equities, "open")
        index_quotes = await data.indices("open")
        assert set(equity_quotes) == ({"HDFCBANK"} if fresh_stream_tick else set())
        assert index_quotes == {}
        assert calls == ["equities", "indices", "history", "history", "history"]

    asyncio.run(scenario())


def test_available_news_does_not_fill_unavailable_market_observations_with_neutral():
    components = {name: {"score": None, "confidence": 0} for name in config.market_weights}
    components["news_sentiment"] = {"score": 47, "confidence": .7, "articles": 70}
    result = weighted_calculation(components)
    assert result["components"]["news_sentiment"]["score"] == 47
    assert result["score"] is None and result["label"] == "UNAVAILABLE"
    assert result["data_quality"] == "DEGRADED"
