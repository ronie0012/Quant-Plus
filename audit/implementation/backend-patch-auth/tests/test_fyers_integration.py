"""Hermetic FYERS auth, data normalization, shared subscriptions and failover."""
import asyncio
import hashlib
import json
import logging
import time
from urllib.parse import parse_qs, urlsplit
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.data import fyers_auth
from app.data.fyers_provider import FyersData, fyers
from app.data.live_market import LiveMarket
from app.main import app


@pytest.fixture(autouse=True)
def isolated_credentials(monkeypatch, tmp_path):
    monkeypatch.setattr(fyers_auth, "PRIVATE_ROOT", tmp_path)
    monkeypatch.setattr(settings, "FYERS_CLIENT_ID", "TEST-100")
    monkeypatch.setattr(settings, "FYERS_SECRET_KEY", "test-secret")
    monkeypatch.setattr(settings, "FYERS_REDIRECT_URI", "http://127.0.0.1:8000/api/v1/fyers/callback")
    monkeypatch.setattr(settings, "FYERS_ACCESS_TOKEN", "")
    monkeypatch.setattr(settings, "WEBSITE_API_KEY", "test-website-key")
    monkeypatch.setattr(fyers, "invalid_token", "")


def test_authorization_exchange_consumes_state_and_keeps_tokens_off_the_callback(monkeypatch):
    async def check():
        url = fyers_auth.start_authorization()
        query = parse_qs(urlsplit(url).query)
        assert "test-secret" not in url
        assert query["client_id"] == ["TEST-100"]
        assert query["redirect_uri"] == [settings.FYERS_REDIRECT_URI]
        state = query["state"][0]
        assert state not in (fyers_auth.PRIVATE_ROOT / "authorization.json").read_text()

        def exchange(request):
            body = json.loads(request.content)
            assert body["code"] == "test-authorization-code"
            assert body["appIdHash"] == hashlib.sha256(b"TEST-100:test-secret").hexdigest()
            return httpx.Response(200, json={"s": "ok", "access_token": "test-access-token"})

        original_client = httpx.AsyncClient
        monkeypatch.setattr(fyers_auth.httpx, "AsyncClient", lambda **kwargs: original_client(
            transport=httpx.MockTransport(exchange), **kwargs))
        await fyers_auth.complete_authorization("test-authorization-code", state)
        assert fyers_auth.access_token() == "TEST-100:test-access-token"
        with pytest.raises(ValueError):
            await fyers_auth.complete_authorization("test-authorization-code", state)

    asyncio.run(check())


def test_invalid_state_cannot_exchange_a_code():
    query = parse_qs(urlsplit(fyers_auth.start_authorization()).query)
    with pytest.raises(ValueError):
        asyncio.run(fyers_auth.complete_authorization("code", "wrong-state"))
    assert (fyers_auth.PRIVATE_ROOT / "authorization.json").exists()
    assert not (fyers_auth.PRIVATE_ROOT / "tokens.json").exists()
    assert query["state"]


def test_expired_tokens_require_a_new_login(monkeypatch):
    import base64
    payload = base64.urlsafe_b64encode(json.dumps({"exp": time.time() - 1}).encode()).decode().rstrip("=")
    monkeypatch.setattr(settings, "FYERS_ACCESS_TOKEN", f"header.{payload}.signature")
    assert fyers_auth.access_token() == ""


@pytest.mark.parametrize("callback_path", ["/api/v1/fyers/callback", "/fyers/callback"])
def test_callback_does_not_return_credentials_and_redacts_access_logs(monkeypatch, callback_path):
    from app.data.live_market import market
    from app.api.fyers import CallbackLogFilter
    completed = AsyncMock()
    refreshed = AsyncMock()
    monkeypatch.setattr(fyers_auth, "complete_authorization", completed)
    monkeypatch.setattr(market, "refresh_fyers_connection", refreshed)
    response = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"}).get(f"{callback_path}?auth_code=sensitive-code&state=sensitive-state")
    assert response.status_code == 200
    assert "sensitive-code" not in response.text and "test-secret" not in response.text
    completed.assert_awaited_once_with("sensitive-code", "sensitive-state")
    refreshed.assert_awaited_once()
    record = logging.LogRecord("uvicorn.access", 20, "", 0, "%s %s %s %s %s",
                               ("client", "GET", f"{callback_path}?auth_code=sensitive-code", "1.1", 200), None)
    CallbackLogFilter().filter(record)
    assert "sensitive-code" not in record.getMessage()


def test_read_only_status_requires_website_key():
    client = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    assert client.get("/api/v1/fyers/status").status_code == 401
    response = client.get("/api/v1/fyers/status", headers={"X-Quantplus-Key": "test-website-key"})
    assert response.json()["login_required"] is True
    assert "test-secret" not in response.text and "access_token" not in response.text


def test_provider_batches_quotes_and_circuit_breaks_expired_auth(monkeypatch):
    async def check():
        provider = FyersData()
        monkeypatch.setattr("app.data.fyers_provider.access_token", lambda: "TEST-100:mock-token")
        calls = []

        def request(req):
            calls.append(req)
            assert req.headers["Authorization"] == "TEST-100:mock-token"
            if req.url.path.endswith("quotes"):
                assert req.url.params["symbols"] == "NSE:RELIANCE-EQ,NSE:M&M-EQ"
                return httpx.Response(200, json={"s": "ok", "d": [
                    {"s": "ok", "n": "NSE:RELIANCE-EQ", "v": {"lp": 100}},
                    {"s": "ok", "n": "NSE:M&M-EQ", "v": {"lp": 200}}]})
            return httpx.Response(401)

        provider.client = httpx.AsyncClient(transport=httpx.MockTransport(request))
        result = await provider.snapshots(["RELIANCE", "M&M"])
        assert result["M&M"]["lp"] == 200 and len(calls) == 1
        with pytest.raises(RuntimeError):
            await provider.depth("RELIANCE")
        assert provider.token() == ""
        with pytest.raises(RuntimeError):
            await provider.depth("RELIANCE")
        assert len(calls) == 2  # Refuse repeated calls with rejected credentials.
        await provider.close()

    asyncio.run(check())


def test_history_prefers_fyers_and_falls_back_to_yahoo(monkeypatch):
    async def check():
        market = LiveMarket()
        monkeypatch.setattr(fyers, "token", lambda: "TEST-100:mock-token")
        result = {"symbol": "SUZLON", "source": "fyers", "candles": [{"close": 100}]}
        history = AsyncMock(return_value=result)
        monkeypatch.setattr(fyers, "history", history)
        assert (await market.history("SUZLON", "1D"))["source"] == "fyers"
        assert (await market.history("SUZLON", "1D"))["source"] == "fyers"
        assert history.await_count == 1
        history.side_effect = RuntimeError("Fyers unavailable")
        monkeypatch.setattr(market, "yahoo_chart", AsyncMock(return_value={"timestamp": [10], "indicators": {"quote": [{
            "open": [100], "high": [101], "low": [99], "close": [100], "volume": [10]}]}}))
        fallback = await market.history("SUZLON", "1W")
        assert fallback["source"] == "yahoo" and fallback["delayed"] is True

    asyncio.run(check())


def test_partial_depth_ticks_preserve_prices_and_unavailable_fields(monkeypatch):
    market = LiveMarket()
    market.listeners["SUZLON"] = set()
    market._tick({"symbol": "NSE:SUZLON-EQ", "type": "dp", "bid_price1": 99.9, "bid_size1": 10})
    market._tick({"symbol": "NSE:SUZLON-EQ", "ltp": 100, "prev_close_price": 99,
                  "last_traded_time": time.time(), "avg_trade_price": 99.5,
                  "tot_buy_qty": 1000, "lower_ckt": 80, "upper_ckt": 120})
    market._tick({"symbol": "NSE:SUZLON-EQ", "type": "dp", "bid_price1": 99.9,
                  "bid_size1": 10, "ask_price1": 100.1, "ask_size1": 20})
    market._tick({"symbol": "NSE:SUZLON-EQ", "ltp": 101, "lower_ckt": 0, "upper_ckt": 0})
    payload = market.quotes["SUZLON"]
    assert payload["price"] == 101 and payload["average_price"] == 99.5
    assert payload["lower_circuit"] == 80 and payload["upper_circuit"] == 120
    assert payload["depth"][0]["ask_quantity"] == 20
    assert payload["depth"][0]["bid_orders"] is None
    assert len(payload["depth"]) == 1  # Never invent absent order-book levels.
    assert payload["depth_as_of"]


def test_closed_market_uses_fyers_snapshot_and_shared_board_subscriptions(monkeypatch):
    async def check():
        market = LiveMarket()
        monkeypatch.setattr(market, "_start_socket", lambda: None)
        monkeypatch.setattr(fyers, "token", lambda: "TEST-100:mock-token")
        snapshot = {"lp": 100, "prev_close_price": 99, "tt": time.time() - 3600, "volume": 500}
        snapshots = AsyncMock(return_value={"SUZLON": snapshot, "TCS": snapshot})
        monkeypatch.setattr(fyers, "snapshots", snapshots)
        monkeypatch.setattr(fyers, "session", AsyncMock(return_value="closed"))
        yahoo = AsyncMock(side_effect=AssertionError("Closed Fyers snapshot must take precedence"))
        monkeypatch.setattr(market, "yahoo_quote", yahoo)
        one = await market.subscribe_many(["SUZLON", "TCS"])
        two = await market.subscribe_many(["SUZLON", "TCS"])
        assert snapshots.await_count == 1 and len(market.tasks) == 2
        assert (await one.get())["source"] == "fyers"
        assert (await two.get())["source"] == "fyers"
        await asyncio.sleep(0)
        assert yahoo.await_count == 0
        await market.unsubscribe_many(["SUZLON", "TCS"], one)
        assert len(market.tasks) == 2
        await market.unsubscribe_many(["SUZLON", "TCS"], two)
        assert not market.tasks and not market.listeners

    asyncio.run(check())
