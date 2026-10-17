"""Eval harness tests: gate logic (pure) + mocked 3-scenario integration. Zero tokens."""
from __future__ import annotations
import json
from datetime import datetime, timezone
import pandas as pd
import pytest

from app.eval import run as R

def _res(label, action, size=0.05):
    return {"label": label, "action": action, "size": size, "correct": action == {"long": "buy", "short": "sell", "flat": "hold"}[label],
            "pnl": 0.0, "instrument": "x", "as_of": "2024-01-01", "session": "s", "resumed": True,
            "fwd_ret": 0.0, "thesis_status": "HEALTHY"}

def test_gates_pass_fail_inconclusive(monkeypatch):
    monkeypatch.setattr(R.gates, "MIN_DECISIVE", 2)
    monkeypatch.setattr(R.gates, "ACCURACY_MIN", 0.5)
    monkeypatch.setattr(R.gates, "NO_EDGE_HOLD_MIN", 0.5)
    good = [_res("long", "buy"), _res("short", "sell"), _res("flat", "hold"), _res("flat", "hold")]
    assert R.summarize(good)["verdict"] == "PASS"
    bad = [_res("long", "sell"), _res("short", "buy"), _res("flat", "hold")]
    assert R.summarize(bad)["verdict"] == "FAIL"
    inconclusive = [_res("flat", "hold"), _res("flat", "buy")]
    assert R.summarize(inconclusive)["verdict"] == "INCONCLUSIVE"

def test_alpha_summary_counts_traded_hits():
    rows = [
        {"label": "long", "action": "buy", "size": 0.05, "correct": True, "pnl": 0.0,
         "instrument": "a", "as_of": "d", "session": "s", "resumed": True,
         "fwd_ret": 0.06, "alpha": 0.03, "thesis_status": "HEALTHY"},
        {"label": "long", "action": "buy", "size": 0.05, "correct": False, "pnl": 0.0,
         "instrument": "b", "as_of": "d", "session": "s", "resumed": True,
         "fwd_ret": 0.05, "alpha": -0.01, "thesis_status": "HEALTHY"},
        {"label": "flat", "action": "hold", "size": 0.0, "correct": True, "pnl": 0.0,
         "instrument": "c", "as_of": "d", "session": "s", "resumed": True,
         "fwd_ret": 0.0, "alpha": 0.005, "thesis_status": "HEALTHY"},
        {"label": "short", "action": "sell", "size": 0.05, "correct": True, "pnl": 0.0,
         "instrument": "d", "as_of": "d", "session": "s", "resumed": True,
         "fwd_ret": -0.05, "alpha": -0.04, "thesis_status": "HEALTHY"},
    ]
    a = R.alpha_summary(rows)
    assert a["n"] == 4
    assert abs(a["mean_alpha"] - (-0.00375)) < 1e-4  # (0.03-0.01+0.005-0.04)/4
    assert a["n_traded"] == 3
    # buy +0.03 alpha = hit; buy -0.01 = miss; short -0.04 (stock lagged index) = hit
    assert a["alpha_hit_rate"] == 0.667


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
                           "direction_symmetry_check_passed": True, "raw_override_applied": False, "reasons": ["mock"]})
    if role == "trader":
        return json.dumps({"instrument": "EVT1.NS", "direction": "long", "size_pct": 0.05,
                           "entry": 105.0, "stop": 100.0, "target": 115.0})
    if role.startswith("risk"):
        return json.dumps({"approve": True, "adjusted_size": 0.05, "notes": "ok"})
    return json.dumps({"action": "buy", "size": 0.05, "rationale": "mock approval here",
                       "thesis_version": 1})

def test_v5_set_disjoint_and_unseen():
    from app.eval.scenarios import SCENARIOS as V1
    from app.eval.scenarios_v5 import SCENARIOS_V5, _CONTAMINATED
    v1windows = set(V1)
    assert not (set(SCENARIOS_V5) & v1windows), "v5 overlaps v1 windows"
    assert not (_CONTAMINATED & {t for t, _ in SCENARIOS_V5})
    assert len(SCENARIOS_V5) == 24

def test_v3rd_set_clean_and_disjoint():
    from app.eval.scenarios import SCENARIOS as V1
    from app.eval.scenarios_v5 import SCENARIOS_V5
    from app.eval.scenarios_v3rd import SCENARIOS_V3RD, SET_NAME
    assert SET_NAME == "v3rd-2026-clean" and len(SCENARIOS_V3RD) == 24
    assert not (set(SCENARIOS_V3RD) & set(V1)), "v3rd overlaps v1 pairs"
    assert not (set(SCENARIOS_V3RD) & set(SCENARIOS_V5)), "v3rd overlaps v5 pairs"


def test_run_eval_mocked(monkeypatch):
    import app.gateway.codecraft as gw
    import app.agents._util as u
    monkeypatch.setattr(gw.gateway, "complete_json",
                        lambda *, role, session_id, system, user: _canned(role))
    monkeypatch.setattr(u.gateway, "complete_json",
                        lambda *, role, session_id, system, user: _canned(role))
    import app.data.yfinance_provider as yfp
    import app.agents.analysts as A
    import app.agents.technical as T
    import app.agents.trader_risk as TR
    import app.data.regime as RG
    for mod in (yfp, T, A, TR, RG):
        monkeypatch.setattr(mod.YFinanceProvider, "ohlcv", lambda self, *a, **k: _df())
    monkeypatch.setattr(A.GNewsProvider, "headlines",
                        lambda self, *a, **k: [{"title": "t", "publisher": "p",
                                                "published_at": "2024-06-07T00:00:00+00:00", "url": ""}])
    import yfinance as yf
    class _Tk:
        def __init__(self, *a, **k): raise RuntimeError("offline")
    monkeypatch.setattr(yf, "Ticker", _Tk)
    monkeypatch.setattr(R, "SCENARIOS", [("EVT1.NS", "2024-06-10"), ("EVT2.NS", "2024-06-10"), ("EVT3.NS", "2024-06-10")])
    fwd = {"EVT1.NS": 0.06, "EVT2.NS": -0.06, "EVT3.NS": 0.01}
    monkeypatch.setattr(R, "forward_return", lambda inst, as_of, horizon=20: fwd[inst])
    monkeypatch.setattr(R, "alpha_return", lambda inst, as_of, horizon=20: 0.02)
    from app.db import sqlite_conn
    for t in ("EVT1.NS", "EVT2.NS", "EVT3.NS"):
        sqlite_conn().execute("DELETE FROM checkpoints WHERE session_id IN (SELECT id FROM sessions WHERE instrument=?)", (t,))
        sqlite_conn().execute("DELETE FROM sessions WHERE instrument=?", (t,))
        sqlite_conn().execute("DELETE FROM theses WHERE instrument=?", (t,))
    sqlite_conn().commit()
    rep1 = R.run_eval()
    assert rep1["n"] == 3 and not any(r["resumed"] for r in rep1["results"])
    assert rep1["results"][0]["label"] == "long" and rep1["results"][2]["label"] == "flat"
    rep2 = R.run_eval()  # rerun bills nothing
    assert all(r["resumed"] for r in rep2["results"])
    assert rep2["scenario_set"] == "v1-2023-2024"


def test_run_eval_custom_set_name(monkeypatch):
    import app.gateway.codecraft as gw
    import app.agents._util as u
    monkeypatch.setattr(gw.gateway, "complete_json",
                        lambda *, role, session_id, system, user: _canned(role))
    monkeypatch.setattr(u.gateway, "complete_json",
                        lambda *, role, session_id, system, user: _canned(role))
    import app.data.yfinance_provider as yfp
    import app.agents.analysts as A
    import app.agents.technical as T
    import app.agents.trader_risk as TR
    import app.data.regime as RG
    for mod in (yfp, T, A, TR, RG):
        monkeypatch.setattr(mod.YFinanceProvider, "ohlcv", lambda self, *a, **k: _df())
    monkeypatch.setattr(A.GNewsProvider, "headlines",
                        lambda self, *a, **k: [{"title": "t", "publisher": "p",
                                                "published_at": "2024-06-07T00:00:00+00:00", "url": ""}])
    import yfinance as yf
    class _Tk2:
        def __init__(self, *a, **k): raise RuntimeError("offline")
    monkeypatch.setattr(yf, "Ticker", _Tk2)
    monkeypatch.setattr(R, "forward_return", lambda inst, as_of, horizon=20: 0.06)
    monkeypatch.setattr(R, "alpha_return", lambda inst, as_of, horizon=20: 0.02)
    from app.db import sqlite_conn
    sqlite_conn().execute("DELETE FROM checkpoints WHERE session_id IN (SELECT id FROM sessions WHERE instrument='SETN.NS')")
    sqlite_conn().execute("DELETE FROM sessions WHERE instrument='SETN.NS'")
    sqlite_conn().execute("DELETE FROM theses WHERE instrument='SETN.NS'")
    sqlite_conn().commit()
    rep = R.run_eval(scenarios=[("SETN.NS", "2024-06-10")], set_name="probe-set")
    assert rep["scenario_set"] == "probe-set" and rep["n"] == 1
