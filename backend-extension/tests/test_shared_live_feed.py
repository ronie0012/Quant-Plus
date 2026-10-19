"""Hermetic shared-stream tests: frozen source + fake SDK, no app/auth imports."""
from __future__ import annotations

import ast
import asyncio
import runpy
import socket
import sys
import threading
import types
from datetime import datetime, timezone
from pathlib import Path

import pytest

from quantplus_intelligence.live_feed import SharedSentimentFeed

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (Path(__file__).parent / "fixtures" / "shared_live_market.py.txt").read_text(encoding="utf-8")
PATCH = runpy.run_path(str(ROOT / "scripts" / "patch-shared-live-feed.py"))["patched_live_market"]


def test_legacy_backend_price_test_patch_is_guarded_and_idempotent():
    patch = runpy.run_path(str(ROOT / "scripts" / "patch-shared-live-feed.py"))["patched_fyers_tests"]
    source = '    assert payload["price"] == 101 and payload["average_price"] == 99.5\n'
    updated = patch(source)
    assert 'payload["price"] == 100' in updated and "Timestamp-free price frame is rejected" in updated
    assert patch(updated) == updated
    with pytest.raises(ValueError):
        patch("unexpected test source")
# Read the explicit constant without importing Settings or opening an env file.
CONFIG = ast.parse((ROOT / "backend-extension" / "quantplus_intelligence" / "config.py").read_text(encoding="utf-8"))
INDICES = ast.literal_eval(next(n.value for n in CONFIG.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "INDEX_SYMBOLS" for t in n.targets)))
# Synthetic membership is intentionally test-only; official provenance is the
# parent's universe-loader contract. Include real spellings with punctuation.
EQUITIES = ["RELIANCE", "M&M", "BAJAJ-AUTO"] + [f"TEST{i}" for i in range(47)]
STAMP = 1792395000  # 2026-10-19T07:30:00Z; a genuine-shaped provider epoch.


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    original = socket.socket.connect

    def blocked(self, address):
        if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1", "localhost"}:
            return original(self, address)  # Windows asyncio's self-pipe only.
        raise AssertionError("No network in shared-feed tests")

    monkeypatch.setattr(socket.socket, "connect", blocked)


@pytest.fixture
def stream(monkeypatch):
    class Provider:
        value = "offline-test-token-a"

        def token(self):
            return self.value

        def __getattr__(self, name):
            raise AssertionError(f"No REST, session, depth or credential calls: {name}")

    sockets = []

    class Socket:
        def __init__(self, **callbacks):
            self.callbacks = callbacks
            self.calls = []
            self.closes = 0
            sockets.append(self)

        def connect(self):
            pass  # Tests explicitly drive open/reconnect callbacks.

        def subscribe(self, *, symbols, data_type):
            self.calls.append((True, tuple(symbols), data_type))

        def unsubscribe(self, *, symbols, data_type):
            self.calls.append((False, tuple(symbols), data_type))

        def close_connection(self):
            self.closes += 1
            self.callbacks["on_close"]()

    class Thread:
        def __init__(self, *, target, **kwargs):
            self.target = target

        def start(self):
            self.target()

    sdk = types.ModuleType("fyers_apiv3.FyersWebsocket")
    sdk.data_ws = types.SimpleNamespace(FyersDataSocket=Socket)
    monkeypatch.setitem(sys.modules, "fyers_apiv3", types.ModuleType("fyers_apiv3"))
    monkeypatch.setitem(sys.modules, "fyers_apiv3.FyersWebsocket", sdk)
    provider = Provider()
    module = types.ModuleType("offline_shared_live_market")
    module.fyers = provider
    exec(compile(PATCH(SOURCE), "offline_shared_live_market.py", "exec"), module.__dict__)
    # Do not modify the process-wide threading module.
    module.threading = types.SimpleNamespace(Thread=Thread)
    module.time = types.SimpleNamespace(time=lambda: STAMP + 10, monotonic=lambda: 1000.0)
    market = module.LiveMarket()
    feed = SharedSentimentFeed(market, provider, index_symbols=INDICES)
    return types.SimpleNamespace(market=market, provider=provider, sockets=sockets, feed=feed, module=module)


async def flush(market):
    # Flush queued SDK callbacks, then wait for any shared resubscribe task.
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    async with market.socket_lock:
        pass


def tick(symbol="RELIANCE", **fields):
    wire = symbol if symbol.startswith("NSE:") else f"NSE:{symbol}-EQ"
    return {"symbol": wire, "ltp": 101, "prev_close_price": 100, "last_traded_time": STAMP, **fields}


def test_default_adapter_is_lazy_for_closed_or_unknown_session():
    async def scenario():
        before = set(sys.modules)
        feed = SharedSentimentFeed()
        assert feed.quote("RELIANCE") is None
        for session in (None, "closed", "unknown", "OPEN"):
            status = await feed.ensure([], session)
            assert status["owned_symbols"] == 0 and not status["connected"]
        await feed.close()
        loaded = set(sys.modules) - before
        assert not any(name.startswith("app.") or name == "quantplus_intelligence.config" for name in loaded)
    asyncio.run(scenario())


def test_sixty_interests_use_existing_socket_without_fallback_or_depth(stream):
    async def scenario():
        result = await stream.feed.ensure(EQUITIES, "open")
        market = stream.market
        assert result["owned_symbols"] == 60
        assert len(market.listeners) == 60 and not market.tasks and not market.deep_symbols
        assert not market.bootstrap_tokens and not market.snapshot_attempts and not market.depth_raw
        assert len(stream.sockets) == 1 and not stream.sockets[0].calls
        stream.sockets[0].callbacks["on_connect"]()
        await flush(market)
        calls = stream.sockets[0].calls
        assert len(calls) == 1 and calls[0][0] and calls[0][2] == "SymbolUpdate"
        assert set(calls[0][1]) == {f"NSE:{s}-EQ" for s in EQUITIES} | set(INDICES.values())
        assert all(not s.endswith("-INDEX-EQ") for s in calls[0][1])
        assert stream.feed.status()["connected"]
        # Per-tick delivery is bounded even when no consumer drains the queue.
        for i in range(1000):
            market._tick(tick(ltp=100 + i))
        assert stream.feed.status()["queue_size"] == 60
        assert stream.feed.quote("RELIANCE")["price"] == 1099
        assert not market.tasks and not market.depth_raw
        await stream.feed.close()
        assert not market.listeners and not market.tasks
        assert stream.sockets[0].closes == 0  # Adapter never owns the socket.
    asyncio.run(scenario())


def test_existing_stock_ownership_and_two_feed_owners_are_preserved(stream):
    async def scenario():
        market = stream.market
        market.loop = asyncio.get_running_loop()
        stock = asyncio.Queue(maxsize=1)
        market.listeners["RELIANCE"] = {stock}
        market.deep_symbols.add("RELIANCE")
        task = asyncio.create_task(asyncio.sleep(3600))
        market.tasks["RELIANCE"] = task
        market._start_socket()
        original_socket = market.socket
        original_socket.callbacks["on_connect"]()
        await flush(market)
        original_socket.calls.clear()
        second = SharedSentimentFeed(market, stream.provider, index_symbols=INDICES)
        await stream.feed.ensure(EQUITIES, "open")
        await second.ensure(EQUITIES, "open")
        assert market.socket is original_socket and len(stream.sockets) == 1
        assert len(market.listeners["RELIANCE"]) == 3 and market.tasks["RELIANCE"] is task
        assert not any(c[2] == "DepthUpdate" for c in original_socket.calls)
        original_socket.calls.clear()
        await stream.feed.close()
        assert not original_socket.calls and len(market.listeners) == 60
        await second.close()
        assert market.listeners == {"RELIANCE": {stock}}
        assert market.deep_symbols == {"RELIANCE"} and not task.cancelled()
        assert "NSE:RELIANCE-EQ" not in original_socket.calls[-1][1]
        assert original_socket.closes == 0
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    asyncio.run(scenario())


def test_existing_stock_subscribe_unsubscribe_can_join_and_leave_sentiment_interests(stream):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        market = stream.market
        market._on_open()
        await flush(market)
        calls = []

        async def stock_fallback(symbol):
            calls.append(symbol)
            await asyncio.sleep(3600)

        market._fallback = stock_fallback
        market.socket.calls.clear()
        page_queue = await market.subscribe("RELIANCE")
        await asyncio.sleep(0)
        assert calls == ["RELIANCE"] and set(market.tasks) == {"RELIANCE"}
        assert market.deep_symbols == {"RELIANCE"}
        assert market.socket.calls == [(True, ("NSE:RELIANCE-EQ",), "SymbolUpdate"),
                                       (True, ("NSE:RELIANCE-EQ",), "DepthUpdate")]
        market._tick(tick())
        assert page_queue.get_nowait()["price"] == stream.feed.quote("RELIANCE")["price"]
        await market.unsubscribe("RELIANCE", page_queue)
        assert "RELIANCE" in market.listeners  # Feed still owns its queue.
        market.socket.calls.clear()
        await stream.feed.close()
        assert not market.listeners and not market.tasks and not market.deep_symbols
        assert market.socket.calls[1] == (False, ("NSE:RELIANCE-EQ",), "DepthUpdate")
        assert market.socket.closes == 0
    asyncio.run(scenario())


def test_repeated_concurrent_ensure_is_idempotent_and_close_is_terminal(stream):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        stream.market._on_open()
        await flush(stream.market)
        socket = stream.market.socket
        socket.calls.clear()
        results = await asyncio.gather(*(stream.feed.ensure(EQUITIES, "open") for _ in range(30)))
        assert all(r["owned_symbols"] == 60 for r in results)
        assert not socket.calls and len(stream.sockets) == 1
        assert all(len(qs) == 1 for qs in stream.market.listeners.values())
        await asyncio.gather(stream.feed.close(), stream.feed.close(), stream.feed.ensure(EQUITIES, "open"))
        assert not stream.market.listeners and stream.feed.status()["state"] == "closed"
        assert len(socket.calls) == 1 and not socket.calls[0][0]
    asyncio.run(scenario())


@pytest.mark.parametrize("session,reason", [("closed", "session_closed"), (None, "session_unknown"), ("OPEN", "session_unknown")])
def test_closed_unknown_release_and_reopen(stream, session, reason):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        stream.market._on_open()
        await flush(stream.market)
        # A stock fallback can predate us, then its last page can depart. It is
        # only safe to cancel that orphan when the final sentiment owner leaves.
        orphan = asyncio.create_task(asyncio.sleep(3600))
        stream.market.tasks["RELIANCE"] = orphan
        stream.market.deep_symbols.add("RELIANCE")
        result = await stream.feed.ensure(EQUITIES, session)
        assert result["reason"] == reason and result["owned_symbols"] == 0
        assert not stream.market.listeners and not stream.market.deep_symbols
        assert not stream.market.tasks and orphan.cancelled()
        depth_releases = [call for call in stream.market.socket.calls if not call[0] and call[2] == "DepthUpdate"]
        assert depth_releases == [(False, ("NSE:RELIANCE-EQ",), "DepthUpdate")]
        assert stream.market.socket.closes == 0
        result = await stream.feed.ensure(EQUITIES, "open")
        assert result["owned_symbols"] == 60 and len(stream.sockets) == 1
        await stream.feed.close()
    asyncio.run(scenario())


@pytest.mark.parametrize("bad", [[], EQUITIES[:49], EQUITIES + ["EXTRA"], EQUITIES[:49] + ["RELIANCE"], EQUITIES[:49] + ["NSE:NIFTY50-INDEX"], "RELIANCE"])
def test_invalid_universe_fails_closed_without_starting_socket(stream, bad):
    async def scenario():
        result = await stream.feed.ensure(bad, "open")
        assert result["reason"] == "invalid_universe" and not stream.sockets
        assert not stream.market.listeners
    asyncio.run(scenario())


def test_membership_rotation_removes_only_departed_equity(stream):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        stream.market._on_open()
        await flush(stream.market)
        stream.market.socket.calls.clear()
        await stream.feed.ensure(EQUITIES[1:] + ["NEWCO"], "open")
        assert len(stream.market.listeners) == 60 and "RELIANCE" not in stream.market.listeners
        assert stream.market.socket.calls == [(False, ("NSE:RELIANCE-EQ",), "SymbolUpdate"), (True, ("NSE:NEWCO-EQ",), "SymbolUpdate")]
        await stream.feed.close()
    asyncio.run(scenario())


def test_reconnect_resubscribes_all_shared_interests_and_token_rotation_ignores_old_callbacks(stream):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        market = stream.market
        old = market.socket
        extra = asyncio.Queue(maxsize=1)
        market.listeners["OTHERPAGE"] = {extra}
        market.deep_symbols.add("OTHERPAGE")
        for _ in range(2):
            old.calls.clear()
            old.callbacks["on_connect"]()
            await flush(market)
            assert len(old.calls[0][1]) == 61
            assert old.calls[1] == (True, ("NSE:OTHERPAGE-EQ",), "DepthUpdate")
        old.callbacks["on_message"](tick())
        await flush(market)
        assert stream.feed.quote("RELIANCE")
        stream.provider.value = "offline-test-token-b"
        await asyncio.gather(*(stream.feed.ensure(EQUITIES, "open") for _ in range(10)),
                             market.refresh_fyers_connection(only_if_token_changed=True))
        assert old.closes == 1 and len(stream.sockets) == 2 and not market.fyers_quotes
        current = market.socket
        current.callbacks["on_connect"]()
        await flush(market)
        assert len(current.calls[0][1]) == 61
        old.callbacks["on_close"]()
        old.callbacks["on_message"](tick(ltp=999))
        old.callbacks["on_connect"]()
        await flush(market)
        assert market.connected and not market.fyers_quotes
        assert len(current.calls) == 2  # Symbol + OTHERPAGE depth; no old open.
        current.callbacks["on_message"](tick(ltp=102))
        await flush(market)
        assert stream.feed.quote("RELIANCE")["price"] == 102
        stream.provider.value = ""  # Logout closes once, never starts a new socket.
        result = await stream.feed.ensure(EQUITIES, "open")
        assert result["reason"] == "login_required" and not market.socket
        assert current.closes == 1 and not stream.feed.quote("RELIANCE")
        assert market.listeners == {"OTHERPAGE": {extra}}
        await stream.feed.close()
    asyncio.run(scenario())


def test_waiting_unsubscribe_cannot_remove_a_new_stock_owner(stream):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        stream.market._on_open()
        await flush(stream.market)
        market = stream.market
        market.socket.calls.clear()
        await market.socket_lock.acquire()
        closing = asyncio.create_task(stream.feed.close())
        await asyncio.sleep(0)
        assert not market.listeners
        stock = asyncio.Queue(maxsize=1)
        market.listeners["RELIANCE"] = {stock}
        market.deep_symbols.add("RELIANCE")
        market.socket_lock.release()
        await closing
        assert market.listeners == {"RELIANCE": {stock}} and market.deep_symbols == {"RELIANCE"}
        assert "NSE:RELIANCE-EQ" not in market.socket.calls[0][1]
    asyncio.run(scenario())


def test_cancelled_token_refresh_finishes_serialized_shared_lifecycle(stream):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        market = stream.market
        old = market.socket
        market.listeners["OTHERPAGE"] = {asyncio.Queue(maxsize=1)}
        entered, permit = asyncio.Event(), threading.Event()
        loop = asyncio.get_running_loop()
        close = old.close_connection

        def slow_close():
            loop.call_soon_threadsafe(entered.set)
            assert permit.wait(3), "Test never released fake SDK close"
            close()

        old.close_connection = slow_close
        stream.provider.value = "offline-test-token-b"
        ensuring = asyncio.create_task(stream.feed.ensure(EQUITIES, "open"))
        await entered.wait()
        ensuring.cancel()
        with pytest.raises(asyncio.CancelledError):
            await ensuring
        # The shared lifecycle keeps its locks even after its caller departed.
        assert market.socket_lock.locked() and market.socket_close_lock.locked()
        departing = asyncio.create_task(stream.feed.close())
        another_refresh = asyncio.create_task(market.refresh_fyers_connection(only_if_token_changed=True))
        await asyncio.sleep(0)
        assert not departing.done()
        permit.set()
        await asyncio.gather(departing, another_refresh)
        await flush(market)
        assert old.closes == 1 and len(stream.sockets) == 2
        assert market._socket_token == stream.provider.value
        assert set(market.listeners) == {"OTHERPAGE"}
        assert not market.socket_lock.locked() and not market.socket_close_lock.locked()
    asyncio.run(scenario())


def test_pending_subscribe_rechecks_interest_after_close(stream):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        market = stream.market
        market.connected = True
        await market.socket_lock.acquire()
        pending = asyncio.create_task(market._subscription(list(market.listeners), True))
        await asyncio.sleep(0)
        closing = asyncio.create_task(stream.feed.close())
        await asyncio.sleep(0)
        market.socket_lock.release()
        await asyncio.gather(pending, closing)
        assert all(not subscribe for subscribe, _, _ in market.socket.calls)
    asyncio.run(scenario())


@pytest.mark.parametrize("name,wire", list(INDICES.items()))
def test_indices_publish_real_exchange_time_and_normalize_names(stream, name, wire):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        key = wire.removeprefix("NSE:")
        stream.market._tick({"symbol": wire, "ltp": 22000, "prev_close_price": 21900, "exch_feed_time": str(STAMP)})
        for spelling in (name, wire, key):
            quote = stream.feed.quote(spelling)
            assert quote["as_of"] == datetime.fromtimestamp(STAMP, timezone.utc).isoformat()
            assert quote["symbol"] == key and quote["price"] == 22000
            assert quote["source"] == "fyers" and not quote["delayed"]
        assert stream.market.quotes[key] == stream.market.fyers_quotes[key]
        assert stream.feed._queue.get_nowait()["symbol"] == key
        copy = stream.feed.quote(name)
        copy["price"] = 0
        assert stream.feed.quote(wire)["price"] == 22000
        await stream.feed.close()
    asyncio.run(scenario())


@pytest.mark.parametrize("bad", [None, "", "invalid", 0, -1, True, float("nan"), float("inf"), STAMP + 71, STAMP * 1000])
def test_timestamp_free_or_invalid_frames_never_publish_or_retime_previous_price(stream, bad):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        market = stream.market
        market._tick(tick(last_traded_time=bad))
        assert not market.fyers_quotes and not market.last_fyers
        market._tick(tick())
        before = dict(market.fyers_quotes["RELIANCE"])
        delivered = stream.feed._queue.qsize()
        market._tick(tick(ltp=999, last_traded_time=bad, received_at=STAMP + 10, timestamp=STAMP + 10, tt=STAMP + 10))
        assert market.fyers_quotes["RELIANCE"] == before
        assert stream.feed._queue.qsize() == delivered
        await stream.feed.close()
    asyncio.run(scenario())


def test_partial_frames_cannot_advance_price_without_price_time_pair_or_regress_time(stream):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        market = stream.market
        market._tick(tick(open_price=99, high_price=102, vol_traded_today=100))
        before = dict(market.fyers_quotes["RELIANCE"])
        market._tick({"symbol": "NSE:RELIANCE-EQ", "last_traded_time": STAMP + 1, "vol_traded_today": 200})
        market._tick({"symbol": "NSE:RELIANCE-EQ", "ltp": 999})
        market._tick({"symbol": "NSE:RELIANCE-EQ", "ltp": 999, "exch_feed_time": STAMP + 1})
        market._tick(tick(ltp=80, last_traded_time=STAMP - 1))
        assert market.fyers_quotes["RELIANCE"] == before
        market._tick(tick(ltp=102, last_traded_time=STAMP + 1))
        value = market.fyers_quotes["RELIANCE"]
        assert value["price"] == 102 and value["open"] == 99 and value["volume"] == 100
        # A timestamp-free depth frame can update depth, never price freshness.
        market._tick({"symbol": "NSE:RELIANCE-EQ", "type": "dp", "bid_price1": 101})
        assert market.fyers_quotes["RELIANCE"]["as_of"] == value["as_of"]
        assert market.fyers_quotes["RELIANCE"]["price"] == 102
        # Daily partial fields must not bleed across a provider trading date.
        market.fyers_quotes["RELIANCE"]["as_of"] = datetime.fromtimestamp(STAMP - 86400, timezone.utc).isoformat()
        market._tick({"symbol": "NSE:RELIANCE-EQ", "ltp": 103, "last_traded_time": STAMP})
        assert market.fyers_quotes["RELIANCE"]["open"] is None
        assert market.fyers_quotes["RELIANCE"]["previous_close"] is None
        await stream.feed.close()
    asyncio.run(scenario())


def test_subscription_failure_retry_and_cancelled_ensure_remain_owned(stream):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        market = stream.market
        market._on_open()
        await flush(market)
        original = market._subscription

        async def failed(*args):
            raise RuntimeError("private exception text must not reach diagnostics")

        market._subscription = failed
        result = await stream.feed.ensure(EQUITIES[1:] + ["NEWCO"], "open")
        assert result["reason"] == "shared_feed_unavailable" and result["pending_release"] == 1
        assert "private" not in repr(stream.feed.diagnostics())
        market._subscription = original
        result = await stream.feed.ensure(EQUITIES, "open")
        assert result["owned_symbols"] == 60 and result["pending_release"] == 0
        # Cancel an ensure while a newly added subscription waits for the lock.
        await market.socket_lock.acquire()
        ensuring = asyncio.create_task(stream.feed.ensure(EQUITIES[1:] + ["NEWCO"], "open"))
        await asyncio.sleep(0)
        ensuring.cancel()
        with pytest.raises(asyncio.CancelledError):
            await ensuring
        market.socket_lock.release()
        await stream.feed.close()
        assert not market.listeners
    asyncio.run(scenario())


def test_failed_or_cancelled_added_subscription_is_retried_without_duplicate_owners(stream):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        market = stream.market
        market._on_open()
        await flush(market)
        original = market._subscription
        failure = True

        async def fail_add(symbols, subscribe):
            if subscribe and failure:
                raise RuntimeError("private subscribe error")
            return await original(symbols, subscribe)

        market._subscription = fail_add
        result = await stream.feed.ensure(EQUITIES[1:] + ["NEWCO"], "open")
        assert result["reason"] == "shared_feed_unavailable" and result["owned_symbols"] == 60
        failure = False
        market.socket.calls.clear()
        result = await stream.feed.ensure(EQUITIES[1:] + ["NEWCO"], "open")
        assert result["state"] == "active"
        assert len(market.socket.calls) == 1 and len(market.socket.calls[0][1]) == 60
        assert all(len(owners) == 1 for owners in market.listeners.values())
        # Cancellation after registration must retain the retry obligation.
        entered, proceed = asyncio.Event(), asyncio.Event()

        async def pause_add(symbols, subscribe):
            if subscribe:
                entered.set()
                await proceed.wait()
            return await original(symbols, subscribe)

        market._subscription = pause_add
        ensuring = asyncio.create_task(stream.feed.ensure(EQUITIES, "open"))
        await entered.wait()
        ensuring.cancel()
        with pytest.raises(asyncio.CancelledError):
            await ensuring
        assert stream.feed.status()["owned_symbols"] == 60
        market._subscription = original
        market.socket.calls.clear()
        await stream.feed.ensure(EQUITIES, "open")
        assert len(market.socket.calls[0][1]) == 60
        await stream.feed.close()
        assert not market.listeners
    asyncio.run(scenario())


def test_no_login_or_missing_source_patch_does_not_register_interests(stream):
    async def scenario():
        stream.provider.value = ""
        result = await stream.feed.ensure(EQUITIES, "open")
        assert result["reason"] == "login_required" and not stream.market.listeners
        assert not stream.sockets
        stream.provider.value = "offline-test-token-a"
        del stream.market.shared_stream_version
        result = await stream.feed.ensure(EQUITIES, "open")
        assert result["reason"] == "source_patch_required" and not stream.market.listeners
        assert not stream.sockets
    asyncio.run(scenario())


@pytest.mark.parametrize("bad", [None, "invalid", True, STAMP * 1000])
def test_index_timestamp_free_frames_do_not_publish_even_with_previous_quote(stream, bad):
    async def scenario():
        await stream.feed.ensure(EQUITIES, "open")
        frame = {"symbol": INDICES["NIFTY"], "ltp": 22000, "exch_feed_time": bad, "received_at": STAMP}
        stream.market._tick(frame)
        assert stream.feed.quote("NIFTY") is None
        stream.market._tick({**frame, "exch_feed_time": STAMP})
        previous = stream.feed.quote("NIFTY")
        stream.market._tick({**frame, "ltp": 999})
        assert stream.feed.quote("NIFTY") == previous
        await stream.feed.close()
    asyncio.run(scenario())


def test_equity_wire_spelling_and_index_feed_time_precedence(stream):
    async def scenario():
        await stream.feed.ensure([f"NSE:{s}-EQ" for s in EQUITIES], "open")
        stream.market._tick(tick("M&M"))
        assert stream.feed.quote("M&M") == stream.feed.quote("NSE:M&M-EQ")
        # Indices have no trades; the actual exchange-feed timestamp is the
        # observation time even if a legacy trade-time field is also present.
        stream.market._tick({"symbol": INDICES["VIX"], "ltp": 14.75,
                             "last_traded_time": STAMP - 86400, "exch_feed_time": STAMP})
        assert stream.feed.quote("VIX")["as_of"] == datetime.fromtimestamp(STAMP, timezone.utc).isoformat()
        await stream.feed.close()
    asyncio.run(scenario())


def test_patch_is_idempotent_and_fails_closed_on_changed_upstream_source():
    patched = PATCH(SOURCE)
    assert PATCH(patched) == patched
    assert "message.get(\"last_traded_time\") or (" not in patched
    with pytest.raises(ValueError, match="_subscription changed"):
        PATCH(SOURCE.replace('symbols=[f"NSE:{s}-EQ" for s in symbols]', 'symbols=unknown_mapping(symbols)'))
    with pytest.raises(ValueError, match="resubscribe every shared listener"):
        PATCH(SOURCE.replace("self._subscription(list(self.listeners), True)", "self._subscription([], True)"))


def test_installer_preflights_before_writes_and_is_idempotent_in_disposable_backend(tmp_path):
    namespace = runpy.run_path(str(ROOT / "scripts" / "install-intelligence-backend.py"))
    app = tmp_path / "app"
    data = app / "data"
    data.mkdir(parents=True)
    main = app / "main.py"
    main.write_text("# fake app, never imported\n", encoding="utf-8")
    provider = data / "fyers_provider.py"
    provider.write_text('exchange = str(row.get("exchange", "")).upper() == "NSE"\nsegment = str(row.get("segment", "")).upper() in ("CM", "CASH", "EQ")\n', encoding="utf-8")
    market = data / "live_market.py"
    market.write_text(SOURCE, encoding="utf-8")
    namespace["install"](tmp_path, check=True)
    assert not (tmp_path / "quantplus_intelligence").exists()
    assert market.read_text(encoding="utf-8") == SOURCE
    market.write_text(SOURCE.replace("self.listeners = {}", "self.listeners = different()"), encoding="utf-8")
    with pytest.raises(ValueError, match="__init__ changed"):
        namespace["install"](tmp_path)
    assert main.read_text(encoding="utf-8") == "# fake app, never imported\n"
    assert not (tmp_path / "quantplus_intelligence").exists()
    market.write_text(SOURCE, encoding="utf-8")
    namespace["install"](tmp_path)
    first = {p: p.read_bytes() for p in (main, provider, market)}
    namespace["install"](tmp_path)
    assert all(p.read_bytes() == value for p, value in first.items())
    assert (tmp_path / "quantplus_intelligence" / "live_feed.py").is_file()
