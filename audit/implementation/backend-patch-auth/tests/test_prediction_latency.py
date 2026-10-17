"""Latency improvements preserve every agent and checkpoint; no live model calls."""
import json
import threading
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from app import schemas as S
from app.api import stocks
from app.agents import graph as G, trader_risk
from app.config import settings
from app.db import sqlite_conn
from app.main import app


@pytest.fixture(autouse=True)
def isolated_db(monkeypatch, tmp_path):
    monkeypatch.setenv("QP_DB_PATH", str(tmp_path / "latency.db"))
    monkeypatch.setattr(settings, "WEBSITE_API_KEY", "test-key")
    monkeypatch.setattr(settings, "CODECRAFT_KEY_1", "test-key")
    monkeypatch.setattr(stocks, "_active_sessions", set())


def insert(sid, status, age=0, symbol="TCS.NS", config="website:test"):
    date = (datetime.now(timezone.utc) - timedelta(seconds=age)).isoformat()
    decision = json.dumps({"action": "hold", "rationale": "Prior research", "authority": "RESEARCH_ONLY"}) if status == "done" else None
    sqlite_conn().execute("INSERT INTO sessions VALUES (?,?,?,?,?,?)",
                         (sid, symbol, date, config, status, decision))
    sqlite_conn().commit()


def test_prior_completed_prediction_visible_during_refresh():
    insert("old", "done", age=1000)
    insert("new", "running")
    value = stocks.session_view("new")
    assert value["status"] == "running"
    assert value["decision"] is None
    assert value["previous_result"]["id"] == "old"
    assert value["previous_result"]["as_of"] != value["as_of"]
    assert value["previous_result"]["previous_result"] is None


@pytest.mark.parametrize("symbol,config,age", [
    ("RELIANCE.NS", "website:test", 100),
    ("TCS.NS", "website:other", 100),
    ("TCS.NS", "website:test", 86401),
])
def test_old_or_unrelated_predictions_are_not_shown(symbol, config, age):
    insert("old", "done", age, symbol, config)
    insert("new", "running")
    assert stocks.session_view("new")["previous_result"] is None


def test_partial_analyst_reports_are_exposed_without_waiting_for_team():
    insert("new", "running")
    report = S.AnalystReport(agent="news", summary="No new headlines", confidence=0.2)
    G._save_ckpt("new", "analyst:news", report.model_dump_json())
    value = stocks.session_view("new")
    assert value["reports"]["news"]["summary"] == report.summary
    assert value["thesis"] is None


def test_status_poll_exposes_interrupted_runs_for_retry():
    insert("new", "running")
    value = stocks.stock_session("new")
    assert value["status"].startswith("failed: backend restarted")
    assert sqlite_conn().execute("SELECT status FROM sessions WHERE id='new'").fetchone()[0] == "running"


def test_risk_reviewers_run_together_with_same_context(monkeypatch):
    barrier = threading.Barrier(3)
    received = []
    def review(role, session, system, user, schema):
        received.append((role, user))
        barrier.wait(timeout=3)
        return S.RiskVerdict(approve=True, adjusted_size=0.025, notes=role)
    monkeypatch.setattr(trader_risk, "call_json", review)
    proposal = S.TradeProposal(instrument="TCS.NS", direction="long", size_pct=0.025, entry=100, stop=95, target=110)
    thesis = S.Thesis(direction="long", conviction=0.5)
    challenge = S.Challenge(status="HEALTHY", core_claim_restated="Test thesis", direction_symmetry_check_passed=True)
    result = trader_risk.run_risk_panel(proposal, thesis, challenge, "test")
    assert list(result) == ["risk_agg", "risk_con", "risk_neu"]
    assert len({context for _, context in received}) == 1


def test_interrupted_website_session_resumes_after_restart(monkeypatch):
    calls = []
    def run(sid, instrument, as_of, interval):
        calls.append(sid)
        sqlite_conn().execute("UPDATE sessions SET status='running' WHERE id=?", (sid,))
        sqlite_conn().commit()
    monkeypatch.setattr(G, "run_session", run)
    client = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    headers = {"X-Quantplus-Key": "test-key"}
    one = client.post("/api/v1/stocks/TCS/prediction", headers=headers).json()
    two = client.post("/api/v1/stocks/TCS/prediction", headers=headers).json()
    assert one["id"] == two["id"]
    assert calls == [one["id"], one["id"]]


def test_individual_analysts_are_checkpointed_and_not_rebilled_on_retry(monkeypatch):
    from app.agents import analysts, technical, events_analyst, debate
    insert("new", "queued")
    calls = []
    def analyst(name):
        def run(*args):
            calls.append(name)
            return S.AnalystReport(agent=name, summary="Observed data", confidence=0.5)
        return run
    monkeypatch.setattr(technical, "run", analyst("technical"))
    monkeypatch.setattr(analysts, "run_fundamentals", analyst("fundamentals"))
    monkeypatch.setattr(analysts, "run_news", analyst("news"))
    monkeypatch.setattr(analysts, "run_macro", analyst("macro"))
    monkeypatch.setattr(events_analyst, "run_events", analyst("events"))
    def failure(*args):
        raise RuntimeError("test debate failure")
    monkeypatch.setattr(debate, "run_debate", failure)
    date = datetime.now(timezone.utc)
    with pytest.raises(RuntimeError, match="test debate failure"):
        G.run_session("new", "TCS.NS", date)
    assert len(calls) == 5
    assert len(stocks.session_view("new")["reports"]) == 5
    sqlite_conn().execute("DELETE FROM checkpoints WHERE session_id='new' AND stage='analysts'")
    sqlite_conn().commit()
    with pytest.raises(RuntimeError, match="test debate failure"):
        G.run_session("new", "TCS.NS", date)
    assert len(calls) == 5
