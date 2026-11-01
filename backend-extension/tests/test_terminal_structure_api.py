"""Offline HTTP coverage of the real terminal routes, cache and detector."""
import asyncio
import os
import socket
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import create_autospec

import httpx
import pytest
from fastapi import FastAPI

from quantplus_intelligence import terminal
from quantplus_intelligence.cache import MemoryCache
from quantplus_intelligence.config import config
from quantplus_intelligence.market_data import ExistingMarketData


NOW = datetime(2026, 10, 23, 7, 30, 30, tzinfo=timezone.utc)
PREFIX = "/api/v1/terminal"


def candle(start, open_=100, high=101, low=99, close=100, **fields):
    return {"time": start.timestamp(), "open": open_, "high": high,
            "low": low, "close": close, "volume": 100, **fields}


def history(rows, interval="1m", **fields):
    return {"candles": rows, "interval": interval, "source": "fyers", "delayed": False,
            "as_of": datetime.fromtimestamp(rows[-1]["time"], timezone.utc).isoformat() if rows else None,
            **fields}


def quote(as_of=NOW, **fields):
    return {"symbol": "INFY", "price": 107, "as_of": as_of.isoformat(), "source": "fyers",
            "market_session": "open", "stale": False, "delayed": False,
            "bid_size": 150, "ask_size": 50, **fields}


def displacement(start, seconds=60):
    return [candle(start - timedelta(seconds=3 * seconds)),
            candle(start - timedelta(seconds=2 * seconds)),
            candle(start - timedelta(seconds=seconds), 102, 103, 100, 100.5),
            candle(start, 100.5, 108, 100, 107)]


@pytest.fixture
def endpoint(monkeypatch, tmp_path):
    # Import the real validation/auth dependencies without reading a local .env.
    monkeypatch.chdir(tmp_path)
    for name in tuple(os.environ):
        if any(part in name.upper() for part in ("KEY", "TOKEN", "SECRET", "DATABASE_URL", "MONGO_URL")):
            monkeypatch.delenv(name)
    monkeypatch.setenv("CODECRAFT_KEY_1", "offline-test-key")
    monkeypatch.setenv("STOCK_PREDICTION_WARM_ENABLED", "false")
    original_connect = socket.socket.connect

    def offline_connect(sock, address):
        # Windows asyncio uses a loopback socketpair for its self-pipe.
        if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1"}:
            return original_connect(sock, address)
        raise AssertionError("Unexpected network access in terminal endpoint test")

    monkeypatch.setattr(socket.socket, "connect", offline_connect)
    from quantplus_intelligence import terminal_api

    adapter = create_autospec(ExistingMarketData, instance=True, spec_set=True)
    adapter.session.return_value = "open"
    adapter.equities.return_value = {}
    adapter.stock_history.return_value = None
    adapter.universe.return_value = {"symbols": ["INFY", "TCS"], "industries": {"INFY": "IT"},
                                     "source": "official-membership-fixture"}
    now, clock = [NOW], [0.0]
    cache = MemoryCache(clock=lambda: clock[0])
    monkeypatch.setattr(terminal, "market_data", adapter)
    monkeypatch.setattr(terminal, "cache", cache)
    monkeypatch.setattr(terminal, "history_slots", asyncio.Semaphore(4))
    monkeypatch.setattr(terminal, "utcnow", lambda: now[0])
    app = FastAPI()
    app.include_router(terminal_api.router, prefix="/api/v1")
    app.dependency_overrides[terminal_api.website_auth] = lambda: None

    def client():
        return httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://fixture")

    return SimpleNamespace(adapter=adapter, client=client, now=now, clock=clock, cache=cache)


@pytest.mark.parametrize(("range_name", "interval", "seconds"), [
    ("1D", "1m", 60), ("1W", "15m", 900), ("1M", "60m", 3600),
])
@pytest.mark.parametrize(("session", "quote_session"), [
    ("open", None), (None, None), ("closed", None), (None, "unknown"), ("open", "closed"),
])
def test_forming_bar_cannot_confirm_without_a_fresh_open_quote(endpoint, range_name, interval, seconds,
                                                             session, quote_session):
    start = NOW.replace(second=0)
    rows = displacement(start, seconds)
    endpoint.adapter.session.return_value = session
    if quote_session:
        endpoint.adapter.equities.return_value = {"INFY": quote(market_session=quote_session)}
    endpoint.adapter.stock_history.return_value = history(rows, interval)

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + "/structure/infy.ns", params={"range": range_name})
        assert response.status_code == 200
        result = response.json()
        assert result["diagnostics"]["valid_candles"] == 3
        assert result["diagnostics"]["incomplete_candles_excluded"] == 1
        assert result["order_blocks"] == []
        assert result["classification"]["label"] == "unavailable"
        assert result["data_cutoff"] == datetime.fromtimestamp(rows[2]["time"], timezone.utc).isoformat()
        endpoint.adapter.equities.assert_awaited_once_with(["INFY"], session)
        endpoint.adapter.stock_history.assert_awaited_once_with("INFY", range_name, session=session)

    asyncio.run(scenario())


@pytest.mark.parametrize("board", [False, True])
def test_completed_boundary_success_excludes_explicitly_complete_forming_and_future_bars(endpoint, board):
    endpoint.now[0] = NOW.replace(second=0)
    rows = displacement(endpoint.now[0] - timedelta(minutes=1))
    rows += [candle(endpoint.now[0], 107, 108, 98, 99, completed=True),
             candle(endpoint.now[0] + timedelta(minutes=1), 107, 108, 98, 99,
                    completed=True, bar_end=rows[0]["time"])]
    snapshot = history(rows, as_of=None)
    endpoint.adapter.stock_history.return_value = deepcopy(snapshot)
    endpoint.adapter.equities.return_value = {"INFY": quote(endpoint.now[0])}

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + ("/structure-board" if board else "/structure/INFY"),
                                        params={"symbols": "infy.ns,INFY"} if board else {})
        assert response.status_code == 200
        result = response.json()["rows"][0] if board else response.json()
        # The confirmed bearish sweep and bullish displacement conflict.
        assert result["classification"]["label"] == "choppy"
        assert result["order_blocks"][0]["status"] == "active"
        assert result["diagnostics"]["valid_candles"] == 4
        assert result["diagnostics"]["incomplete_candles_excluded"] == 1
        assert result["diagnostics"]["future_candles_excluded"] == 1
        assert result["live_price"] == 107
        assert result["depth_imbalance"]["imbalance"] == .5
        assert result["rank"]["components"]["active_zone"] > 0
        assert result["evaluated_at"] == result["as_of"] == endpoint.now[0].isoformat()
        assert result["history"]["as_of"] is None
        assert endpoint.adapter.stock_history.return_value == snapshot
        endpoint.adapter.session.assert_awaited_once_with()
        endpoint.adapter.equities.assert_awaited_once_with(["INFY"], "open")
        endpoint.adapter.stock_history.assert_awaited_once_with("INFY", "1D", session="open")

    asyncio.run(scenario())


@pytest.mark.parametrize(("session", "hour", "minute", "valid"), [
    ("closed", 10, 0, 4), ("closed", 9, 59, 3), (None, 10, 0, 3), ("open", 10, 0, 3),
])
def test_short_final_cash_hour_requires_verified_close(endpoint, session, hour, minute, valid):
    # 09:45 UTC = 15:15 IST; the last hourly cash bar ends at 15:30 IST.
    start = NOW.replace(hour=9, minute=45, second=0)
    endpoint.now[0] = NOW.replace(hour=hour, minute=minute, second=0)
    endpoint.adapter.session.return_value = session
    endpoint.adapter.stock_history.return_value = history(displacement(start, 3600), "60m")

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + "/structure/INFY", params={"range": "1M"})
        assert response.status_code == 200
        result = response.json()
        assert result["diagnostics"]["valid_candles"] == valid
        assert len(result["order_blocks"]) == (1 if valid == 4 else 0)

    asyncio.run(scenario())


def test_fresh_quote_does_not_relabel_old_delayed_history(endpoint):
    supplied = history(displacement(NOW - timedelta(days=1)), source="yahoo", delayed=True)
    endpoint.adapter.stock_history.return_value = supplied
    endpoint.adapter.equities.return_value = {"INFY": quote()}

    async def scenario():
        async with endpoint.client() as client:
            result = (await client.get(PREFIX + "/structure/INFY")).json()
        assert result["source"] == result["history"]["source"] == "yahoo"
        assert result["history"]["delayed"] is True
        assert result["data_cutoff"] == result["history"]["as_of"] == supplied["as_of"]
        assert result["as_of"] == result["quote"]["as_of"] == NOW.isoformat()

    asyncio.run(scenario())


@pytest.mark.parametrize("as_of", [None, "not-a-timestamp", (NOW + timedelta(days=1)).isoformat()])
def test_provider_as_of_never_authorizes_future_candles_or_freshens_quote(endpoint, as_of):
    rows = displacement(NOW.replace(second=0) - timedelta(minutes=1))
    rows.append(candle(NOW + timedelta(days=1), completed=True))
    endpoint.adapter.stock_history.return_value = history(rows, as_of=as_of)
    endpoint.adapter.equities.return_value = {"INFY": quote(as_of=NOW + timedelta(days=1))}

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + "/structure/INFY")
        assert response.status_code == 200
        result = response.json()
        assert result["diagnostics"]["future_candles_excluded"] == 1
        assert result["diagnostics"]["valid_candles"] == 4
        assert result["as_of"] == result["data_cutoff"]
        assert result["quote"]["stale"] is True
        assert result["live_price"] is None and result["depth_imbalance"] is None

    asyncio.run(scenario())


@pytest.mark.parametrize("stale_flag", [False, True])
def test_stale_quote_does_not_clip_new_history_or_supply_live_context(endpoint, stale_flag):
    rows = displacement(NOW.replace(second=0) - timedelta(minutes=1))
    supplied = history(rows, source="yahoo", delayed=True)
    old_quote = quote(NOW - timedelta(hours=1), stale=stale_flag)
    endpoint.adapter.stock_history.return_value = deepcopy(supplied)
    endpoint.adapter.equities.return_value = {"INFY": old_quote}

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + "/structure/INFY")
        assert response.status_code == 200
        result = response.json()
        assert result["diagnostics"]["valid_candles"] == 4
        assert result["order_blocks"][0]["status"] == "active"
        assert result["as_of"] == result["data_cutoff"] == supplied["as_of"]
        assert result["history"] == {key: supplied[key] for key in ("source", "as_of", "interval", "delayed")}
        assert result["source"] == "yahoo"
        assert result["quote"] == {**old_quote, "stale": True}
        assert result["live_price"] is None and result["depth_imbalance"] is None
        assert endpoint.adapter.stock_history.return_value == supplied

    asyncio.run(scenario())


@pytest.mark.parametrize("path", ["/structure/BAD!", "/structure-board"])
def test_invalid_symbols_are_request_errors_not_provider_errors(endpoint, path):
    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + path, params={"symbols": "BAD!"})
        assert response.status_code == 422
        assert "NSE equity symbol" in response.json()["detail"]
        assert endpoint.adapter.mock_calls == []

    asyncio.run(scenario())


@pytest.mark.parametrize(("path", "params"), [
    ("/structure/INFY", {"range": "6M"}),
    ("/structure/INFY", {"range": "1d"}),
    ("/structure-board", {"range": "3M"}),
    ("/structure-board", {"symbols": ""}),
    ("/structure-board", {"symbols": " , "}),
    ("/structure-board", {"symbols": "INFY,,TCS"}),
    ("/structure-board", {"symbols": ",".join(f"S{i}" for i in range(51))}),
])
def test_request_validation_happens_before_adapter_calls(endpoint, path, params):
    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + path, params=params)
        assert response.status_code == 422
        assert response.json()["detail"]
        assert endpoint.adapter.mock_calls == []

    asyncio.run(scenario())


@pytest.mark.parametrize("bad_history", [
    None, [], "opaque-provider-detail", {}, {"candles": None}, {"candles": 42},
    {"candles": {"unexpected": "opaque-provider-detail"}, "interval": []},
    {"candles": [], "source": "yahoo", "delayed": True},
    {"candles": [None, "opaque-provider-detail", {"time": True}, {"time": 10 ** 400}],
     "source": "fyers", "interval": "1m"},
])
@pytest.mark.parametrize("board", [False, True])
def test_missing_or_malformed_history_keeps_a_serializable_unavailable_row(endpoint, bad_history, board):
    endpoint.adapter.stock_history.return_value = bad_history
    endpoint.adapter.equities.return_value = {"INFY": quote()}

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + ("/structure-board" if board else "/structure/INFY"),
                                        params={"symbols": "INFY"} if board else {})
        assert response.status_code == 200
        assert "opaque-provider-detail" not in response.text
        result = response.json()["rows"][0] if board else response.json()
        assert result["symbol"] == "INFY"
        assert result["quality"] == "UNAVAILABLE"
        assert result["classification"]["label"] == "unavailable"
        assert result["rank"]["score"] is None
        assert result["data_cutoff"] is None
        assert result["error"]
        assert result["source"] == (bad_history.get("source") if isinstance(bad_history, dict) else None)
        if board:
            assert response.json()["requested"] == 1 and response.json()["observed"] == 0

    asyncio.run(scenario())


def test_malformed_rows_are_counted_without_discarding_valid_history(endpoint):
    rows = displacement(NOW.replace(second=0) - timedelta(minutes=1))
    bad_rows = [None, "bad", {"time": True}, {"time": float("inf")},
                candle(NOW - timedelta(minutes=6), high=98),
                candle(NOW - timedelta(minutes=5), completed="yes")]
    endpoint.adapter.stock_history.return_value = history(rows, candles=rows + bad_rows)

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + "/structure/INFY")
        assert response.status_code == 200
        result = response.json()
        assert result["diagnostics"]["input_candles"] == len(rows) + len(bad_rows)
        assert result["diagnostics"]["invalid_candles"] == len(bad_rows)
        assert result["diagnostics"]["valid_candles"] == 4
        assert result["quality"] == "PARTIAL"
        assert result["order_blocks"][0]["status"] == "active"

    asyncio.run(scenario())


def test_provider_replayed_timestamps_are_collapsed_before_structure(endpoint):
    rows = displacement(NOW.replace(second=0) - timedelta(minutes=1))
    replayed = rows + [dict(row) for row in rows]
    replayed[-1]["open"] += 0.5
    endpoint.adapter.stock_history.return_value = history(replayed)

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + "/structure/INFY")
        assert response.status_code == 200
        result = response.json()
        assert result["diagnostics"]["input_candles"] == len(rows)
        assert result["diagnostics"]["duplicate_timestamps"] == 0
        assert result["diagnostics"]["valid_candles"] == len(rows)
        assert result["classification"]["label"] != "unavailable"

    asyncio.run(scenario())


@pytest.mark.parametrize("interval", [None, [], {}, "unknown", "1d"])
def test_unknown_bar_duration_cannot_be_guessed_from_gaps(endpoint, interval):
    endpoint.adapter.stock_history.return_value = history(displacement(NOW - timedelta(hours=2)), interval)

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + "/structure/INFY")
        assert response.status_code == 200
        result = response.json()
        assert result["quality"] == "UNAVAILABLE"
        assert result["data_cutoff"] is None and result["order_blocks"] == []
        assert result["diagnostics"]["incomplete_candles_excluded"] == 4

    asyncio.run(scenario())


@pytest.mark.parametrize("board", [False, True])
def test_history_provider_failure_is_sanitized_and_retains_missing_rows(endpoint, board, capsys):
    endpoint.adapter.stock_history.side_effect = RuntimeError("opaque-provider-detail")

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + ("/structure-board" if board else "/structure/INFY"))
        assert response.status_code == 200
        assert "opaque-provider-detail" not in response.text
        rows = response.json()["rows"] if board else [response.json()]
        assert {row["symbol"] for row in rows} == ({"INFY", "TCS"} if board else {"INFY"})
        assert all(row["error"] == "Provider history unavailable" and row["quality"] == "UNAVAILABLE" for row in rows)

    asyncio.run(scenario())
    captured = capsys.readouterr()
    assert "opaque-provider-detail" not in captured.out + captured.err


@pytest.mark.parametrize(("path", "method", "detail"), [
    ("/structure/INFY", "session", "Market structure unavailable"),
    ("/structure/INFY", "equities", "Market structure unavailable"),
    ("/structure-board", "universe", "Market structure board unavailable"),
    ("/structure-board", "equities", "Market structure board unavailable"),
])
@pytest.mark.parametrize("http_error", [False, True])
def test_endpoint_failure_states_do_not_leak_provider_errors(endpoint, path, method, detail, http_error):
    from fastapi import HTTPException
    getattr(endpoint.adapter, method).side_effect = (HTTPException(401, "opaque-provider-detail") if http_error
                                                    else RuntimeError("opaque-provider-detail"))

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + path)
        assert response.status_code == 502
        assert response.json() == {"detail": detail}

    asyncio.run(scenario())


@pytest.mark.parametrize("session", ["open", "closed", None])
def test_default_cash_board_preserves_50_rows_four_history_slots_and_singleflight_ttl(endpoint, session):
    symbols = [f"S{i}" for i in range(50)]
    endpoint.adapter.universe.return_value = {"symbols": symbols, "industries": {"S0": "IT"},
                                             "source": "official-membership-fixture"}
    endpoint.adapter.session.return_value = session
    active, peak = 0, 0

    async def stock_history(symbol, range_name="6M", session=None):
        nonlocal active, peak
        assert symbol in symbols and range_name == "1D"
        active += 1
        peak = max(peak, active)
        try:
            await asyncio.sleep(0)
            if symbol == "S1":
                return None
            if symbol == "S2":
                raise RuntimeError("opaque-provider-detail")
            if symbol == "S3":
                return {"candles": None}
            return history(displacement(NOW.replace(second=0) - timedelta(minutes=1)))
        finally:
            active -= 1

    endpoint.adapter.stock_history.side_effect = stock_history

    async def scenario():
        async with endpoint.client() as client:
            responses = await asyncio.gather(*(client.get(PREFIX + "/structure-board") for _ in range(8)))
            assert all(response.status_code == 200 for response in responses)
            result = responses[0].json()
            assert all(response.json() == result for response in responses)
            assert result["universe"] == "NIFTY_50"
            assert result["requested"] == 50 and result["observed"] == 47
            assert {row["symbol"] for row in result["rows"]} == set(symbols)
            assert {row["symbol"] for row in result["rows"] if row["quality"] == "UNAVAILABLE"} == {"S1", "S2", "S3"}
            assert next(row for row in result["rows"] if row["symbol"] == "S0")["industry"] == "IT"
            assert peak == 4
            assert endpoint.adapter.stock_history.await_count == 50
            endpoint.adapter.equities.assert_awaited_once_with(symbols, session)
            ttl = config.market_ttl_seconds if session == "open" else config.closed_market_ttl_seconds
            endpoint.clock[0] = ttl - .01
            assert (await client.get(PREFIX + "/structure-board")).json() == result
            assert endpoint.adapter.stock_history.await_count == 50
            endpoint.clock[0] = ttl
            assert (await client.get(PREFIX + "/structure-board")).status_code == 200
            assert endpoint.adapter.stock_history.await_count == 100
            assert endpoint.adapter.equities.await_count == 2
            assert len(endpoint.cache.values) == 1 and endpoint.cache.pending == {}

    asyncio.run(scenario())


def test_cached_forming_bar_does_not_age_into_confirmation_and_ranges_have_separate_entries(endpoint):
    endpoint.adapter.stock_history.return_value = history(displacement(NOW.replace(second=0)))

    async def scenario():
        async with endpoint.client() as client:
            first = (await client.get(PREFIX + "/structure/INFY")).json()
            endpoint.now[0] += timedelta(seconds=35)
            endpoint.clock[0] += 35
            assert (await client.get(PREFIX + "/structure/INFY")).json() == first
            assert first["order_blocks"] == [] and first["diagnostics"]["valid_candles"] == 3
            endpoint.adapter.stock_history.assert_awaited_once_with("INFY", "1D", session="open")
            response = await client.get(PREFIX + "/structure/INFY", params={"range": "1W"})
            assert response.status_code == 200
            endpoint.adapter.stock_history.assert_awaited_with("INFY", "1W", session="open")
            assert endpoint.adapter.stock_history.await_count == 2

    asyncio.run(scenario())


def test_unavailable_membership_never_substitutes_another_universe(endpoint):
    endpoint.adapter.universe.return_value = {"symbols": [], "source": None}

    async def scenario():
        async with endpoint.client() as client:
            response = await client.get(PREFIX + "/structure-board")
        assert response.status_code == 200
        result = response.json()
        assert result["rows"] == [] and result["requested"] == result["observed"] == 0
        assert result["source"] is None and result["universe"] == "NIFTY_50"
        endpoint.adapter.equities.assert_not_awaited()
        endpoint.adapter.stock_history.assert_not_awaited()

    asyncio.run(scenario())


@pytest.mark.parametrize("board", [False, True])
def test_cached_quote_expires_without_retiming_history_or_refetching(endpoint, board):
    endpoint.adapter.equities.return_value = {"INFY": quote(NOW - timedelta(seconds=59)),
                                              "TCS": quote(symbol="TCS", bid_size=100, ask_size=100)}

    async def stock_history(symbol, range_name="6M", session=None):
        rows = displacement(NOW.replace(second=0) - timedelta(minutes=1))
        if symbol == "TCS":
            rows[-1]["volume"] = 110
        return history(rows)

    endpoint.adapter.stock_history.side_effect = stock_history

    async def scenario():
        path = PREFIX + ("/structure-board" if board else "/structure/INFY")
        async with endpoint.client() as client:
            first = (await client.get(path)).json()
            initial = first["rows"][0] if board else first
            assert initial["symbol"] == "INFY" and initial["live_price"] == 107
            original_cache = deepcopy(list(endpoint.cache.values.values()))
            endpoint.now[0] += timedelta(seconds=2)
            endpoint.clock[0] += 2
            response = await client.get(path)
        assert response.status_code == 200
        result = response.json()
        expired = next(row for row in result["rows"] if row["symbol"] == "INFY") if board else result
        assert expired["quote"]["stale"] is True
        assert expired["quote"]["as_of"] == initial["quote"]["as_of"]
        assert expired["live_price"] is None and expired["depth_imbalance"] is None
        assert expired["data_cutoff"] == expired["as_of"] == initial["data_cutoff"]
        assert expired["evaluated_at"] == initial["evaluated_at"]
        assert expired["rank"]["score"] == initial["rank"]["score"] - initial["rank"]["components"]["depth_imbalance"]
        assert "depth_imbalance" not in expired["rank"]["components"]
        assert expired["order_blocks"] == initial["order_blocks"]
        assert list(endpoint.cache.values.values()) == original_cache
        assert endpoint.adapter.stock_history.await_count == (2 if board else 1)
        assert endpoint.adapter.equities.await_count == 1
        if board:
            assert result["rows"][0]["symbol"] == "TCS", "Board ordering must reflect expired depth context"

    asyncio.run(scenario())
