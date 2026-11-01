"""Hermetic coverage of the session-aware stock-history adapter.

The 50-symbol structure board must not re-fight the shared FYERS request
budget on every refresh: completed candles are immutable, so a closed
session's FYERS history is reused; a Yahoo fallback is deliberately not
cached so the next load retries the provider and heals the row.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from quantplus_intelligence.market_data import ExistingMarketData


def fyers_history():
    return {"source": "fyers", "interval": "1m", "delayed": False,
            "candles": [{"time": 1769000000, "open": 100, "high": 101,
                         "low": 99, "close": 100, "volume": 10}]}


def yahoo_history():
    return {"source": "yahoo", "interval": "1m", "delayed": True,
            "candles": fyers_history()["candles"]}


@pytest.fixture
def data(monkeypatch):
    instance = ExistingMarketData()
    history = AsyncMock(return_value=fyers_history())
    monkeypatch.setattr("app.data.live_market.market.history", history)
    return SimpleNamespace(instance=instance, history=history)


def test_closed_fyers_history_is_reused_within_ttl(data):
    async def scenario():
        first = await data.instance.stock_history("INFY", "1D", session="closed")
        second = await data.instance.stock_history("INFY", "1D", session="closed")
        assert first == second and first["source"] == "fyers"
        assert data.history.await_count == 1
        # A different session must never inherit the closed-session entry.
        await data.instance.stock_history("INFY", "1D", session="open")
        assert data.history.await_count == 2

    asyncio.run(scenario())


def test_yahoo_fallback_is_not_cached_and_heals_on_the_next_load(data):
    async def scenario():
        data.history.return_value = yahoo_history()
        degraded = await data.instance.stock_history("INFY", "1D", session="closed")
        assert degraded["source"] == "yahoo"
        data.history.return_value = fyers_history()
        healed = await data.instance.stock_history("INFY", "1D", session="closed")
        assert healed["source"] == "fyers" and data.history.await_count == 2

    asyncio.run(scenario())


def test_missing_session_is_resolved_per_call_but_provider_only_once(data):
    async def scenario():
        data.instance.session = AsyncMock(return_value="closed")
        await data.instance.stock_history("INFY", "1D")
        await data.instance.stock_history("INFY", "1D")
        # The cached market-status resolve is cheap; the provider must not be.
        assert data.instance.session.await_count == 2
        assert data.history.await_count == 1

    asyncio.run(scenario())


def test_provider_failure_returns_none_and_is_not_cached(data):
    async def scenario():
        data.history.side_effect = RuntimeError("No historical candles available")
        assert await data.instance.stock_history("INFY", "1D", session="closed") is None
        data.history.side_effect = None
        data.history.return_value = fyers_history()
        assert (await data.instance.stock_history("INFY", "1D", session="closed"))["source"] == "fyers"

    asyncio.run(scenario())


def test_ttl_bounds_are_enforced():
    from quantplus_intelligence.config import IntelligenceSettings

    with pytest.raises(ValueError):
        IntelligenceSettings(closed_stock_history_ttl_seconds=30)
    with pytest.raises(ValueError):
        IntelligenceSettings(open_stock_history_ttl_seconds=5)
