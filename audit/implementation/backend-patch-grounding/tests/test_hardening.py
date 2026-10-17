"""Phase 7 exit tests: kill-resume without re-billing, cost-cap abort, deadline, structured logs."""
from __future__ import annotations
import json
from datetime import datetime, timezone
import pandas as pd
import pytest

from app import schemas as S
from app.agents import graph as G
from app.db import sqlite_conn
from app.gateway.codecraft import TokenCapBreach

AS_OF = datetime(2024, 6, 10, tzinfo=timezone.utc)
SID = "hkr1"

def _df():
    idx = pd.date_range("2024-04-20", periods=30, freq="B", tz="UTC")
    return pd.DataFrame({"Open": 100.0, "High": 102.0, "Low": 99.0,
                         "Close": [100 + i * 0.3 for i in range(30)],
                         "Volume": 1_000_000}, index=idx)

def _canned(role: str) -> str:
    if role in ("technical", "fundamentals", "news", "macro", "events"):
        return json.dumps({"summary": f"{role} canned summary, trend constructive",
                           "signals": [],
                           "confidence": 0.6,
                           "evidence": []})
    if role in ("bull", "bear"):
        return json.dumps({"stance": "long" if role == "bull" else "short",
                           "argument": f"{role} canned case", "rebuttal_to": "",
                           "confidence_delta": 0.0})
    if role == "research_manager":
        return json.dumps({"direction": "long", "conviction": 0.65,
                           "key_evidence": ["e1"], "key_risks": ["r1"],
                           "mechanism_type": "MOMENTUM_CONTINUATION"})
    if role == "devils_advocate":
        return json.dumps({"status": "HEALTHY",
                           "core_claim_restated": "Mock thesis causal claim restated here",
                           "new_evidence_considered": [], "duplicate_risks_discarded": ["mock risk"],
                           "direction_symmetry_check_passed": True, "raw_override_applied": False, "reasons": ["mock check"]})
    if role == "trader":
        return json.dumps({"instrument": "HST.NS", "direction": "long", "size_pct": 0.05,
                           "entry": 105.0, "stop": 100.0, "target": 115.0})
    if role.startswith("risk"):
        return json.dumps({"approve": True, "adjusted_size": 0.05, "notes": "ok"})
    if role == "portfolio_manager":
        return json.dumps({"action": "buy", "size": 0.05,
                           "rationale": "mock approval, risk panel unanimous", "thesis_version": 1})
    raise AssertionError(role)

@pytest.fixture()
def env(monkeypatch):
    import app.gateway.codecraft as gw
    import app.agents._util as u
    import app.agents.technical as T
    import app.agents.analysts as A
    import app.agents.trader_risk as TR
    import app.data.yfinance_provider as yfp
    import app.data.regime as RG
    llm_calls: list[str] = []

    def counting_complete(*, role, session_id, system, user):
        llm_calls.append(role)
        return _canned(role)

    monkeypatch.setattr(gw.gateway, "complete_json", counting_complete)
    monkeypatch.setattr(u.gateway, "complete_json", counting_complete)
    for mod in (yfp, T, A, TR, RG):
        monkeypatch.setattr(mod.YFinanceProvider, "ohlcv", lambda self, *a, **k: _df())
    monkeypatch.setattr(A.GNewsProvider, "headlines",
                        lambda self, *a, **k: [{"title": "t", "publisher": "p",
                                                "published_at": "2024-06-07T00:00:00+00:00", "url": ""}])
    import yfinance as yf
    class _T:
        def __init__(self, *a, **k): raise RuntimeError("offline")
    monkeypatch.setattr(yf, "Ticker", _T)
    sqlite_conn().execute("DELETE FROM sessions WHERE id IN ('hkr1','hkr2','hkr3')")
    sqlite_conn().execute("DELETE FROM session_events WHERE session_id IN ('hkr1','hkr2','hkr3')")
    sqlite_conn().execute("DELETE FROM checkpoints WHERE session_id IN ('hkr1','hkr2','hkr3')")
    sqlite_conn().execute("DELETE FROM theses WHERE instrument='HST.NS'")
    sqlite_conn().commit()
    sqlite_conn().execute(
        "INSERT INTO sessions(id, instrument, as_of, config_hash, status, decision) VALUES (?,?,?,?,?,?)",
        (SID, "HST.NS", AS_OF.isoformat(), "test", "queued", None))
    sqlite_conn().commit()
    return llm_calls

def _status(sid: str) -> str:
    return sqlite_conn().execute("SELECT status FROM sessions WHERE id=?", (sid,)).fetchone()[0]

def test_kill_resume_no_duplicate_billing(env, monkeypatch):
    import app.agents.debate as D
    llm_calls = env
    real_debate = D.run_debate
    state = {"n": 0}

    def flaky(*a, **k):
        state["n"] += 1
        if state["n"] == 1:
            raise RuntimeError("simulated kill -9")
        return real_debate(*a, **k)

    monkeypatch.setattr(D, "run_debate", flaky)
    with pytest.raises(RuntimeError, match="simulated kill"):
        G.run_session(SID, "HST.NS", AS_OF, "1d")
    assert _status(SID).startswith("failed")
    assert G._load_ckpt(SID, "analysts") is not None  # analysts checkpointed before crash

    monkeypatch.setattr(D, "run_debate", real_debate)
    dec = G.run_session(SID, "HST.NS", AS_OF, "1d")  # resume
    assert isinstance(dec, S.FinalDecision) and _status(SID) == "done"
    for role in ("technical", "fundamentals", "news", "macro", "events"):
        assert llm_calls.count(role) == 1, f"{role} re-billed on resume: {llm_calls}"
    assert len(G.thesis_history("HST.NS")) == 1  # no duplicate thesis version

def test_cost_cap_breach_aborts_gracefully(env, monkeypatch):
    import app.gateway.codecraft as gw
    real_track = gw.gateway._track

    def tracked_complete(*, role, session_id, system, user):
        real_track(session_id, 10_000)  # real cap enforcement, fake size
        return _canned(role)

    monkeypatch.setattr(gw.gateway, "complete_json", tracked_complete)
    import app.agents._util as u
    monkeypatch.setattr(u.gateway, "complete_json", tracked_complete)
    monkeypatch.setattr("app.config.settings.SESSION_TOKEN_CAP", 25_000)
    sqlite_conn().execute(
        "INSERT OR REPLACE INTO sessions(id, instrument, as_of, config_hash, status, decision) VALUES (?,?,?,?,?,?)",
        ("hkr2", "HST.NS", AS_OF.isoformat(), "test", "queued", None))
    sqlite_conn().commit()
    with pytest.raises(TokenCapBreach):
        G.run_session("hkr2", "HST.NS", AS_OF, "1d")
    assert _status("hkr2") == "failed: TokenCapBreach"

def test_deadline_aborts_before_any_billing(env):
    llm_calls = env
    sqlite_conn().execute(
        "INSERT OR REPLACE INTO sessions(id, instrument, as_of, config_hash, status, decision) VALUES (?,?,?,?,?,?)",
        ("hkr3", "HST.NS", AS_OF.isoformat(), "test", "queued", None))
    sqlite_conn().commit()
    with pytest.raises(TimeoutError):
        G.run_session("hkr3", "HST.NS", AS_OF, "1d", deadline_s=-1)
    assert _status("hkr3") == "failed: TimeoutError"
    assert llm_calls == []

def test_structured_log_covers_session(env):
    import app.agents.debate as D
    G.run_session(SID, "HST.NS", AS_OF, "1d")
    assert D  # silence linters
    lines = [json.loads(x) for x in open("data/sessions.log", encoding="utf-8") if x.strip()]
    mine = [x for x in lines if x.get("session") == SID]
    stages = {x.get("stage") for x in mine}
    assert {"session", "analyst", "debate", "thesis", "challenge", "trade", "risk"} <= stages
