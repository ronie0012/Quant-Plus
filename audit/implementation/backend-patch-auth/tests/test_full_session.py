"""Full-session test with mocked LLM + market data: zero tokens, verifies wiring + versioning."""
from __future__ import annotations
import json
from datetime import datetime, timezone
import pandas as pd
import pytest

from app import schemas as S
from app.agents import graph as G
from app.db import sqlite_conn

AS_OF = datetime(2024, 6, 10, tzinfo=timezone.utc)
MODE = {"challenge": "HEALTHY"}

def _df():
    idx = pd.date_range("2024-04-20", periods=30, freq="B", tz="UTC")
    return pd.DataFrame({"Open": 100.0, "High": 102.0, "Low": 99.0,
                         "Close": [100 + i * 0.3 for i in range(30)],
                         "Volume": 1_000_000}, index=idx)

def _fake_complete(*, role, session_id, system, user):
    if role in ("technical", "fundamentals", "news", "macro", "events"):
        return json.dumps({"summary": f"{role} canned summary, trend constructive",
                           "signals": [{"name": "mom", "value": 0.5, "direction": "bullish"}],
                           "confidence": 0.6,
                           "evidence": [{"source": "test", "ref": "t1",
                                         "available_at": "2024-06-07T00:00:00Z"}]})
    if role in ("bull", "bear"):
        stance = "long" if role == "bull" else "short"
        return json.dumps({"stance": stance, "argument": f"{role} canned case",
                           "rebuttal_to": "", "confidence_delta": 0.0})
    if role == "research_manager":
        return json.dumps({"direction": "long", "conviction": 0.65,
                           "key_evidence": ["e1"], "key_risks": ["r1"],
                           "mechanism_type": "MOMENTUM_CONTINUATION"})
    if role == "devils_advocate":
        return json.dumps({"status": MODE["challenge"],
                           "core_claim_restated": "Mock thesis causal claim restated here",
                           "new_evidence_considered": ["mock factor"] if MODE["challenge"] != "HEALTHY" else [],
                           "duplicate_risks_discarded": ["mock risk"],
                           "direction_symmetry_check_passed": True, "raw_override_applied": False, "reasons": ["mock check"]})
    if role == "trader":
        return json.dumps({"instrument": "TEST.NS", "direction": "long", "size_pct": 0.05,
                           "entry": 105.0, "stop": 100.0, "target": 115.0})
    if role.startswith("risk"):
        return json.dumps({"approve": True, "adjusted_size": 0.05, "notes": "ok"})
    if role == "portfolio_manager":
        return json.dumps({"action": "buy", "size": 0.05,
                           "rationale": "mock approval, risk panel unanimous", "thesis_version": 1})
    raise AssertionError(role)

@pytest.fixture(autouse=True)
def _mocks(monkeypatch):
    import app.gateway.codecraft as gw
    import app.agents._util as u
    monkeypatch.setattr(gw.gateway, "complete_json", _fake_complete)
    monkeypatch.setattr(u.gateway, "complete_json", _fake_complete)
    import app.data.yfinance_provider as yfp
    import app.agents.analysts as A
    import app.agents.technical as T
    import app.agents.trader_risk as TR
    import app.data.regime as RG
    monkeypatch.setattr(yfp.YFinanceProvider, "ohlcv", lambda self, *a, **k: _df())
    monkeypatch.setattr(T.YFinanceProvider, "ohlcv", lambda self, *a, **k: _df())
    monkeypatch.setattr(A.YFinanceProvider, "ohlcv", lambda self, *a, **k: _df())
    monkeypatch.setattr(TR.YFinanceProvider, "ohlcv", lambda self, *a, **k: _df())
    monkeypatch.setattr(RG.YFinanceProvider, "ohlcv", lambda self, *a, **k: _df())
    monkeypatch.setattr(A.GNewsProvider, "headlines",
                        lambda self, *a, **k: [{"title": "t", "publisher": "p",
                                                "published_at": "2024-06-07T00:00:00+00:00", "url": ""}])
    import yfinance as yf
    class _T:
        def __init__(self, *a, **k): raise RuntimeError("offline")
    monkeypatch.setattr(yf, "Ticker", _T)

def _mk_session(sid, inst="TEST.NS"):
    sqlite_conn().execute(
        "INSERT OR REPLACE INTO sessions(id, instrument, as_of, config_hash, status, decision) VALUES (?,?,?,?,?,?)",
        (sid, inst, AS_OF.isoformat(), "test", "queued", None))
    sqlite_conn().commit()

@pytest.fixture(autouse=True)
def _clean():
    sids = ("s1a", "s1b", "s3a", "s3b")
    sqlite_conn().execute("DELETE FROM sessions WHERE id IN ('s1','s2','s1a','s1b','s3a','s3b')")
    sqlite_conn().execute("DELETE FROM session_events WHERE session_id IN ('s1','s2','s1a','s1b','s3a','s3b')")
    sqlite_conn().execute("DELETE FROM checkpoints WHERE session_id IN ('s1','s2','s1a','s1b','s3a','s3b')")
    sqlite_conn().execute("DELETE FROM theses WHERE instrument IN ('TEST.NS','TESTDIFF.NS')")
    sqlite_conn().commit()

def _run_pair(prefix: str, instrument: str):
    MODE["challenge"] = "HEALTHY"
    _mk_session(prefix + "a", instrument)
    d1 = G.run_session(prefix + "a", instrument, AS_OF, "1d")
    MODE["challenge"] = "BROKEN"
    _mk_session(prefix + "b", instrument)
    d2 = G.run_session(prefix + "b", instrument, AS_OF, "1d")
    return d1, d2

def test_full_session_healthy_then_broken():
    dec, dec2 = _run_pair("s1", "TEST.NS")
    assert isinstance(dec, S.FinalDecision) and dec.thesis_version >= 1 and dec.action == "buy"
    assert len(G.session_events("s1a")) >= 8  # analysts(4)+debate+thesis+challenge+trade+risk+session
    assert dec2.action == "hold" and dec2.size == 0.0  # deterministic guardrail
    hist = G.thesis_history("TEST.NS")
    assert [h["status"] for h in hist[-2:]] == ["HEALTHY", "BROKEN"]

def test_api_diff_reports_status_change():
    from fastapi.testclient import TestClient
    from app.main import app
    _run_pair("s3", "TESTDIFF.NS")
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    hist = G.thesis_history("TESTDIFF.NS")
    v1, v2 = hist[-2]["version"], hist[-1]["version"]
    r = c.get(f"/api/v1/theses/TESTDIFF.NS/diff/{v1}/{v2}")
    assert r.status_code == 200 and r.json()["status_changed"] is True
