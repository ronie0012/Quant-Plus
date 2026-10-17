"""Instant serving keeps full research, provenance, freshness and bounded jobs."""
import json
import threading
import time
from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

from app.api import stocks
from app.config import settings
from app.db import sqlite_conn
from app.main import app


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setenv("QP_DB_PATH", str(tmp_path / "serving.db"))
    monkeypatch.setattr(settings, "WEBSITE_API_KEY", "test-key")
    monkeypatch.setattr(settings, "CODECRAFT_KEY_1", "test-model")
    monkeypatch.setattr(settings, "STOCK_PREDICTION_WARM_ENABLED", False)
    monkeypatch.setattr(stocks, "_active_sessions", set())
    monkeypatch.setattr(stocks, "_recent_symbols", {})
    monkeypatch.setattr(stocks, "_slots", threading.BoundedSemaphore(2))
    monkeypatch.setattr(stocks.G, "run_session", lambda *args: pytest.fail("Read path must never run models"))


def seed(sid="completed", age=100, symbol="HDFCBANK", cfg=None, status="done"):
    as_of = (datetime.now(timezone.utc) - timedelta(seconds=age)).isoformat()
    decision = {"action": "hold", "rationale": "Complete full research", "authority": "RESEARCH_ONLY"}
    conn = sqlite_conn()
    conn.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?)",
                 (sid, symbol + ".NS", as_of, cfg or stocks.prediction_config(), status,
                  json.dumps(decision) if status == "done" else None))
    conn.execute("INSERT INTO checkpoints VALUES (?,?,?,?)", (sid, "analysts", json.dumps({
        "technical": {"agent": "technical", "summary": "Original evidence", "confidence": 0.5}}), as_of))
    conn.commit()
    return as_of


def test_read_path_returns_original_completed_research_without_models():
    cutoff = seed()
    client = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    headers = {"X-Quantplus-Key": "test-key"}
    result = client.get("/api/v1/stocks/HDFCBANK/prediction", headers=headers).json()
    assert result["as_of"] == cutoff
    assert result["decision"]["authority"] == "RESEARCH_ONLY"
    assert result["reports"]["technical"]["summary"] == "Original evidence"
    assert result["serving"]["freshness"] == "fresh"
    assert client.get("/api/v1/stocks/predictions?symbols=HDFCBANK,TCS", headers=headers).json()["predictions"].keys() == {"HDFCBANK"}
    assert client.get("/api/v1/stocks/HDFCBANK/prediction").status_code == 401


def test_wrong_config_expired_and_missing_snapshots_never_masquerade_as_current():
    seed(cfg="another-model")
    assert stocks.prediction_snapshots("HDFCBANK")["predictions"] == {}
    seed("expired", age=86401)
    assert stocks.prediction_snapshots("HDFCBANK")["predictions"] == {}
    with pytest.raises(Exception) as exc:
        stocks.prediction_snapshot("TCS")
    assert exc.value.status_code == 404


def test_cache_remains_visible_during_refresh_without_waiting_for_graph():
    cutoff = seed(age=1000)
    bg = BackgroundTasks()
    value = stocks.prediction("HDFCBANK", bg)
    assert len(bg.tasks) == 1
    assert value["status"] == "queued"
    assert value["previous_result"]["as_of"] == cutoff
    assert value["previous_result"]["serving"]["freshness"] == "stale"
    again = stocks.prediction("HDFCBANK", BackgroundTasks())
    assert again["id"] == value["id"]


def test_capacity_and_operator_pause_do_not_hide_available_research(monkeypatch):
    cutoff = seed(age=1000)
    assert stocks._slots.acquire(False) and stocks._slots.acquire(False)
    try:
        value = stocks.prediction("HDFCBANK", BackgroundTasks())
        assert value["as_of"] == cutoff
        assert value["serving"]["refresh_status"] == "capacity"
        assert value["refresh_seconds"] == 60
    finally:
        stocks._slots.release()
        stocks._slots.release()
    monkeypatch.setattr(stocks.control, "is_engaged", lambda: True)
    assert stocks.prediction("HDFCBANK", BackgroundTasks())["serving"]["refresh_status"] == "paused"


def test_warmer_refreshes_ahead_keeps_full_graph_and_reserves_foreground(monkeypatch):
    monkeypatch.setattr(settings, "STOCK_PREDICTION_WARM_ENABLED", True)
    monkeypatch.setattr(settings, "STOCK_PREDICTION_WARM_SYMBOLS", "HDFCBANK,TCS")
    monkeypatch.setattr(settings, "STOCK_PREDICTION_MAX_CONCURRENT", 2)
    seed(age=650)
    cursor, bg = stocks.warm_next()
    assert len(bg.tasks) == 1
    assert bg.tasks[0].func is stocks._run
    assert bg.tasks[0].args[1] == "HDFCBANK.NS"
    assert cursor == 1
    _, another = stocks.warm_next(cursor)
    assert not another.tasks


def test_warmer_does_not_refresh_fresh_or_hammer_failed_jobs(monkeypatch):
    monkeypatch.setattr(settings, "STOCK_PREDICTION_WARM_ENABLED", True)
    monkeypatch.setattr(settings, "STOCK_PREDICTION_WARM_SYMBOLS", "HDFCBANK,TCS")
    seed(age=100)
    seed("failed", age=100, symbol="TCS", status="failed: provider")
    assert not stocks.warm_next()[1].tasks


def test_warming_respects_budget_reserve_and_future_cutoffs(monkeypatch):
    monkeypatch.setattr(settings, "STOCK_PREDICTION_WARM_ENABLED", True)
    monkeypatch.setattr(settings, "STOCK_PREDICTION_WARM_SYMBOLS", "HDFCBANK")
    seed(age=-120)
    assert stocks.prediction_snapshots("HDFCBANK")["predictions"] == {}
    conn = sqlite_conn()
    conn.execute("INSERT INTO usage_daily VALUES (?,?)",
                 (datetime.now().date().isoformat(), int(settings.DAY_TOKEN_CAP * 0.5)))
    conn.commit()
    assert not stocks.warm_next()[1].tasks


def test_risk_retry_reuses_only_identical_completed_reviewers(monkeypatch):
    from app.agents import trader_risk
    from app import schemas as S
    calls = []
    fail = True
    def review(role, *args):
        calls.append(role)
        if role == "risk_neu" and fail:
            raise RuntimeError("temporary outage")
        return S.RiskVerdict(approve=True, adjusted_size=0.025, notes=role)
    monkeypatch.setattr(trader_risk, "call_json", review)
    proposal = S.TradeProposal(instrument="HDFCBANK.NS", direction="long", size_pct=0.025, entry=100, stop=95, target=110)
    thesis = S.Thesis(direction="long", conviction=0.5)
    challenge = S.Challenge(status="HEALTHY", core_claim_restated="Test research thesis", direction_symmetry_check_passed=True)
    with pytest.raises(RuntimeError, match="temporary"):
        trader_risk.run_risk_panel(proposal, thesis, challenge, "risk-retry")
    fail = False
    result = trader_risk.run_risk_panel(proposal, thesis, challenge, "risk-retry")
    assert len(calls) == 4
    assert list(result) == ["risk_agg", "risk_con", "risk_neu"]
    changed = proposal.model_copy(update={"entry": 101})
    trader_risk.run_risk_panel(changed, thesis, challenge, "risk-retry")
    assert len(calls) == 7


def test_same_instrument_downloads_coalesce_and_keep_cutoff(monkeypatch, tmp_path):
    from app.data import yfinance_provider as provider
    from concurrent.futures import ThreadPoolExecutor
    monkeypatch.setattr(provider, "CACHE_DIR", str(tmp_path))
    calls = []
    as_of = datetime(2026, 10, 11, 12, tzinfo=timezone.utc)
    frame = pd.DataFrame({"Close": [100, 200]}, index=pd.to_datetime(["2026-10-10", "2026-10-12"], utc=True))
    def download(*args):
        calls.append(args)
        time.sleep(0.03)
        return frame.copy()
    monkeypatch.setattr(provider, "_download_with_retry", download)
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(lambda _: provider.YFinanceProvider().ohlcv("HDFCBANK.NS", as_of), range(5)))
    assert len(calls) == 1
    assert all(result["Close"].tolist() == [100] for result in results)


def test_debate_retry_keeps_completed_turns_and_original_round_context(monkeypatch):
    from app.agents import debate
    from app import schemas as S
    calls = []
    fail = True
    def respond(role, sid, system, user, schema, fixed):
        calls.append((role, user))
        if role == "bear" and fail:
            raise RuntimeError("temporary debate outage")
        return S.DebateTurn(stance=fixed["stance"], argument=f"{role} evidence supported reasoning",
                            rebuttal_to="", confidence_delta=0.1)
    monkeypatch.setattr(debate, "call_json", respond)
    reports = [S.AnalystReport(agent="technical", summary="Observed market evidence", confidence=0.5)]
    with pytest.raises(RuntimeError, match="temporary"):
        debate.run_debate(reports, "debate-retry")
    fail = False
    result = debate.run_debate(reports, "debate-retry")
    assert [role for role, _ in calls] == ["bull", "bear", "bear", "bull", "bear"]
    assert len(result) == 4
    assert "bull evidence supported reasoning" in calls[2][1]
    again = debate.run_debate(reports, "debate-retry")
    assert again == result and len(calls) == 5
    reports[0] = reports[0].model_copy(update={"summary": "Changed market evidence"})
    debate.run_debate(reports, "debate-retry")
    assert len(calls) == 9
