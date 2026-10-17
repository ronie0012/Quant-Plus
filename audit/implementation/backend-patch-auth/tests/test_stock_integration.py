"""Website boundary tests: real graph adapter, coalescing, auth and feed failover."""
import asyncio
import json
import time
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import sqlite_conn
from app.main import app
from app.data.live_market import LiveMarket, quote_payload


@pytest.fixture(autouse=True)
def no_live_fyers_credentials(monkeypatch):
    from app.data.fyers_provider import fyers
    monkeypatch.setattr(fyers, "token", lambda: "")


def test_website_endpoints_fail_closed_without_auth_configuration(monkeypatch):
    monkeypatch.setattr(settings, "WEBSITE_API_KEY", "")
    with TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"}) as client:
        for path in ["/api/v1/stocks/search?q=RELIANCE", "/api/v1/fyers/status",
                     "/api/v1/market/RELIANCE/history"]:
            response = client.get(path)
            assert response.status_code == 503
            assert "authentication" in response.json()["detail"]


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("QP_DB_PATH", str(tmp_path / "website.db"))
    monkeypatch.setattr(settings, "WEBSITE_API_KEY", "test-website-key")
    monkeypatch.setattr(settings, "CODECRAFT_KEY_1", "test-model-key")
    return TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})


@pytest.mark.parametrize("symbol", ["RELIANCE", "TCS", "INFY", "M&M", "BAJAJ-AUTO", "360ONE", "SUZLON"])
def test_prediction_runs_graph_once_and_returns_actual_checkpoints(client, monkeypatch, symbol):
    from app.api import stocks
    calls = []

    def graph(sid, instrument, as_of, interval):
        calls.append((sid, instrument, interval))
        conn = sqlite_conn()
        conn.execute("UPDATE sessions SET status='done', decision=? WHERE id=?",
                     (json.dumps({"action": "hold", "rationale": "Insufficient evidence to act", "authority": "RESEARCH_ONLY"}), sid))
        conn.execute("INSERT INTO checkpoints VALUES (?,?,?,?)", (sid, "thesis", json.dumps(
            {"conviction": 0.42, "direction": "flat", "key_evidence": ["Observed weak momentum"], "key_risks": []}), as_of.isoformat()))
        conn.commit()

    monkeypatch.setattr(stocks.G, "run_session", graph)
    headers = {"X-Quantplus-Key": "test-website-key"}
    first = client.post(f"/api/v1/stocks/{symbol}/prediction", headers=headers)
    second = client.post(f"/api/v1/stocks/{symbol}/prediction", headers=headers)
    assert first.status_code == second.status_code == 202
    assert first.json()["id"] == second.json()["id"]
    assert len(calls) == 1
    assert calls[0][1:] == (symbol + ".NS", "1d")
    result = client.get(f'/api/v1/stocks/sessions/{first.json()["id"]}', headers=headers).json()
    assert result["status"] == "done"
    assert result["decision"]["action"] == "hold"
    assert result["thesis"]["conviction"] == 0.42


def test_profile_accepts_equities_outside_the_static_catalog(client, monkeypatch):
    from app.api import stocks
    from app.data.live_market import market
    monkeypatch.setattr(stocks, "stock_catalog", lambda: [])
    received = []

    async def chart(symbol):
        received.append(symbol)
        return {"meta": {"instrumentType": "EQUITY", "longName": "Example NSE Company"}}

    monkeypatch.setattr(market, "yahoo_chart", chart)
    result = client.get("/api/v1/stocks/EXAMPLE.NS/profile", headers={"X-Quantplus-Key": "test-website-key"})
    assert result.status_code == 200
    assert result.json()["company"] == "Example NSE Company"
    assert result.json()["symbol"] == "EXAMPLE"
    assert received == ["EXAMPLE"]


def test_profile_errors_do_not_invent_an_instrument(client, monkeypatch):
    from app.data.live_market import market

    async def chart(symbol):
        raise ValueError("Not available")

    monkeypatch.setattr(market, "yahoo_chart", chart)
    result = client.get("/api/v1/stocks/UNKNOWN/profile", headers={"X-Quantplus-Key": "test-website-key"})
    assert result.status_code == 502


def test_search_finds_company_and_symbols_outside_nifty50(client, monkeypatch):
    from app.api import stocks
    monkeypatch.setattr(stocks, "stock_catalog", lambda: [{"symbol": "SUZLON", "company": "Suzlon Energy", "sector": "Energy"}])
    headers = {"X-Quantplus-Key": "test-website-key"}
    assert client.get("/api/v1/stocks/search?q=energy", headers=headers).json()["stocks"][0]["symbol"] == "SUZLON"
    assert client.get("/api/v1/stocks/search?q=SUZLON", headers=headers).json()["stocks"][0]["symbol"] == "SUZLON"


def test_auth_symbol_validation_and_unconfigured_agents(client, monkeypatch):
    assert client.post("/api/v1/stocks/RELIANCE/prediction").status_code == 401
    headers = {"X-Quantplus-Key": "test-website-key"}
    assert client.post("/api/v1/stocks/BAD!symbol/prediction", headers=headers).status_code == 422
    for i in range(1, 6):
        monkeypatch.setattr(settings, f"CODECRAFT_KEY_{i}", "")
    assert client.post("/api/v1/stocks/TCS/prediction", headers=headers).status_code == 503
    assert client.get("/api/v1/market/RELIANCE/history?range=INVALID", headers=headers).status_code == 422


def test_failed_analysis_retry_keeps_the_same_session_and_checkpoints(client, monkeypatch):
    from app.api import stocks
    calls = []

    def graph(sid, instrument, as_of, interval):
        calls.append(sid)
        conn = sqlite_conn()
        if len(calls) == 1:
            conn.execute("INSERT INTO checkpoints VALUES (?,?,?,?)", (sid, "thesis", '{"conviction":0.5}', as_of.isoformat()))
            conn.execute("UPDATE sessions SET status='failed: transient' WHERE id=?", (sid,))
        else:
            assert conn.execute("SELECT 1 FROM checkpoints WHERE session_id=?", (sid,)).fetchone()
            conn.execute("UPDATE sessions SET status='done' WHERE id=?", (sid,))
        conn.commit()

    monkeypatch.setattr(stocks.G, "run_session", graph)
    headers = {"X-Quantplus-Key": "test-website-key"}
    one = client.post("/api/v1/stocks/RELIANCE/prediction", headers=headers).json()
    assert client.post("/api/v1/stocks/RELIANCE/prediction", headers=headers).json()["status"].startswith("failed")
    two = client.post("/api/v1/stocks/RELIANCE/prediction?retry=true", headers=headers).json()
    assert one["id"] == two["id"]
    assert calls == [one["id"], one["id"]]


def test_final_governance_metadata_is_code_owned(monkeypatch):
    from app import schemas as S
    from app.agents import _util, trader_risk
    calls = []

    def response(**kwargs):
        calls.append(kwargs)
        return json.dumps({"action": "hold", "size": 0, "rationale": "No directional edge in this research",
                           "thesis_version": 999, "authority": "Portfolio Manager",
                           "cannot_create_position": False, "cannot_reverse_position": False,
                           "cannot_increase_exposure": False})

    monkeypatch.setattr(_util.gateway, "complete_json", response)
    thesis = S.Thesis(direction="flat", conviction=0.3)
    challenge = S.Challenge(status="HEALTHY", core_claim_restated="No directional edge in this research",
                            direction_symmetry_check_passed=True)
    proposal = S.TradeProposal(instrument="RELIANCE.NS", direction="flat", size_pct=0, entry=100, stop=95, target=105)
    result = trader_risk.run_pm("RELIANCE.NS", thesis, challenge, proposal, {}, 1, "test-fixed-authority")
    assert len(calls) == 1
    assert result.action == "hold" and result.thesis_version == 1
    assert result.authority == "RESEARCH_ONLY"
    assert result.cannot_create_position and result.cannot_reverse_position and result.cannot_increase_exposure


def test_quotes_preserve_trade_time_and_never_call_yahoo_realtime():
    old = time.time() - 900
    result = quote_payload("RELIANCE", 100, 80, old, "yahoo")
    assert result["delayed"] is True and result["stale"] is True
    assert result["change"] == 20 and result["change_pct"] == 25
    assert datetime.fromisoformat(result["as_of"]).timestamp() == pytest.approx(old)
    with pytest.raises(ValueError):
        quote_payload("RELIANCE", 100, 80, None, "fyers")


def test_shared_fallback_stream_recovers_on_fyers_tick(monkeypatch):
    async def check():
        market = LiveMarket()
        monkeypatch.setattr(market, "_start_socket", lambda: None)
        requests = []

        async def yahoo(symbol):
            requests.append(symbol)
            return quote_payload(symbol, 100, 99, time.time() - 900, "yahoo")

        monkeypatch.setattr(market, "yahoo_quote", yahoo)
        one = await market.subscribe("RELIANCE")
        two = await market.subscribe("RELIANCE")
        assert len(market.tasks) == 1
        assert (await asyncio.wait_for(one.get(), 1))["source"] == "yahoo"
        assert (await asyncio.wait_for(two.get(), 1))["source"] == "yahoo"
        assert len(requests) == 1
        market._tick({"symbol": "NSE:RELIANCE-EQ", "ltp": 101,
                      "prev_close_price": 99, "last_traded_time": time.time()})
        assert (await one.get())["source"] == "fyers"
        assert (await two.get())["price"] == 101
        await market.unsubscribe("RELIANCE", one)
        assert len(market.tasks) == 1
        await market.unsubscribe("RELIANCE", two)
        assert not market.tasks and not market.listeners

    asyncio.run(check())


def test_history_filters_invalid_candles_and_coalesces(monkeypatch):
    async def check():
        market = LiveMarket()
        calls = []

        async def chart(*args):
            calls.append(args)
            return {"timestamp": [10, 20], "indicators": {"quote": [{
                "open": [100, None], "high": [102, 103], "low": [99, 100],
                "close": [101, 102], "volume": [500, None]}]}}

        monkeypatch.setattr(market, "yahoo_chart", chart)
        results = await asyncio.gather(market.history("RELIANCE", "1D"), market.history("RELIANCE", "1D"))
        assert len(calls) == 1 and results[0] == results[1]
        assert len(results[0]["candles"]) == 1

    asyncio.run(check())
