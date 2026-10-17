"""Shared zero-token mocks for API-level tests (WS, e2e). Import, don't duplicate."""
from __future__ import annotations
import json
import pandas as pd

def install_mocks(monkeypatch) -> list[str]:
    import app.gateway.codecraft as gw
    import app.agents._util as u
    import app.data.yfinance_provider as yfp
    import app.agents.analysts as A
    import app.agents.technical as T
    import app.agents.trader_risk as TR
    import app.data.regime as RG
    calls: list[str] = []

    def canned(role: str) -> str:
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
            return json.dumps({"status": "HEALTHY", "core_claim_restated": "Mock thesis causal claim restated here",
                               "new_evidence_considered": [], "duplicate_risks_discarded": ["mock risk"],
                               "direction_symmetry_check_passed": True, "raw_override_applied": False, "reasons": ["mock"]})
        if role == "trader":
            return json.dumps({"instrument": "WSTEST.NS", "direction": "long", "size_pct": 0.05,
                               "entry": 105.0, "stop": 100.0, "target": 115.0})
        if role.startswith("risk"):
            return json.dumps({"approve": True, "adjusted_size": 0.05, "notes": "ok"})
        return json.dumps({"action": "buy", "size": 0.05, "rationale": "mock approval here",
                           "thesis_version": 1})

    def counting_complete(*, role, session_id, system, user):
        calls.append(role)
        return canned(role)

    monkeypatch.setattr(gw.gateway, "complete_json", counting_complete)
    monkeypatch.setattr(u.gateway, "complete_json", counting_complete)
    idx = pd.date_range("2024-04-20", periods=30, freq="B", tz="UTC")
    df = pd.DataFrame({"Open": 100.0, "High": 102.0, "Low": 99.0,
                       "Close": [100 + i * 0.3 for i in range(30)],
                       "Volume": 1_000_000}, index=idx)
    for mod in (yfp, T, A, TR, RG):
        monkeypatch.setattr(mod.YFinanceProvider, "ohlcv", lambda self, *a, **k: df)
    monkeypatch.setattr(A.GNewsProvider, "headlines",
                        lambda self, *a, **k: [{"title": "t", "publisher": "p",
                                                "published_at": "2024-06-07T00:00:00+00:00", "url": ""}])
    import yfinance as yf
    class _Tk:
        def __init__(self, *a, **k): raise RuntimeError("offline")
    monkeypatch.setattr(yf, "Ticker", _Tk)
    return calls
