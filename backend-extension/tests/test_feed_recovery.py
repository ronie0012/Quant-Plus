"""Hermetic reproduction of the dead-socket market-hours starvation.

fyersDataSocket.log 2026-10-27 14:38 IST: SSL verification failed inside the
SDK's symbol-token lookup and the socket object stayed alive while no tick
flowed for hours — LiveMarket._start_socket never recreates an existing socket,
so breadth, sector and volume inputs starved and market sentiment went DEGRADED
with no snapshots after 14:15 IST. The bounded recovery in ExistingMarketData
must force one LiveMarket reset during OPEN silence, then hold the cooldown.
"""
from __future__ import annotations

import asyncio
import time

import pytest

from quantplus_intelligence.config import config
from quantplus_intelligence.market_data import ExistingMarketData


@pytest.fixture(autouse=True)
def fyers_token(monkeypatch):
    """The recovery must not depend on a live FYERS login in tests."""
    import app.data.fyers_provider as provider
    monkeypatch.setattr(provider.fyers, "token", lambda: "test-token")


class FakeFeed:
    def __init__(self, market):
        self._market = market

    def status(self):
        return {"state": "active", "reason": None}


class FakeMarket:
    def __init__(self, last_tick_age):
        self.listeners = {f"S{i}": set() for i in range(50)}
        self.listeners["NIFTY50-INDEX"] = set()
        self.last_fyers = {f"S{i}": time.monotonic() - last_tick_age for i in range(50)}
        self._socket_attempt = time.monotonic() - last_tick_age
        self.resets = 0

    async def refresh_fyers_connection(self):
        self.resets += 1


def _data(market):
    data = ExistingMarketData(feed=FakeFeed(market))
    data._last_feed_reset = time.monotonic() - config.stream_reset_cooldown_seconds - 1
    return data


def test_dead_socket_is_reset_during_open(monkeypatch):
    market = FakeMarket(last_tick_age=1000.0)
    asyncio.run(_data(market)._recover_shared_feed("open"))
    assert market.resets == 1


def test_closed_or_unknown_sessions_never_reset():
    for session in ("closed", None):
        market = FakeMarket(last_tick_age=1000.0)
        asyncio.run(_data(market)._recover_shared_feed(session))
        assert market.resets == 0


def test_fresh_ticks_do_not_trigger_a_reset():
    market = FakeMarket(last_tick_age=5.0)
    asyncio.run(_data(market)._recover_shared_feed("open"))
    assert market.resets == 0


def test_cooldown_bounds_recovery():
    market = FakeMarket(last_tick_age=1000.0)
    data = _data(market)
    data._last_feed_reset = time.monotonic() - (config.stream_reset_cooldown_seconds - 10)
    asyncio.run(data._recover_shared_feed("open"))
    assert market.resets == 0  # one reset per cooldown window


def test_index_only_listeners_never_trigger_a_reset():
    """Index-only pages own no equity ticks; the app fallback covers them."""
    market = FakeMarket(last_tick_age=1000.0)
    market.listeners = {"NIFTY50-INDEX": set(), "NIFTYBANK-INDEX": set()}
    asyncio.run(_data(market)._recover_shared_feed("open"))
    assert market.resets == 0
