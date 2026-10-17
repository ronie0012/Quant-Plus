"""Phase 9: frozen v1 contract snapshot + live WS event streaming (mocked LLM, real HTTP+WS)."""
from __future__ import annotations
import json
from fastapi.testclient import TestClient
from app.main import app
from tests._mocks import install_mocks

FROZEN_PATHS = {
    ("POST", "/api/v1/sessions"),
    ("GET", "/api/v1/sessions/{sid}"),
    ("GET", "/api/v1/theses/{instrument}"),
    ("GET", "/api/v1/theses/{instrument}/diff/{v1}/{v2}"),
    ("POST", "/api/v1/eval/run"),
    ("GET", "/api/v1/health"),
    # Day 6 frontend surface (additive).
    ("GET", "/api/v1/arena"),
    ("POST", "/api/v1/arena/founders"),
    ("GET", "/api/v1/arena/events"),
    ("GET", "/api/v1/killswitch"),
    ("POST", "/api/v1/killswitch"),
    ("GET", "/api/v1/audit/export"),
}

def test_openapi_contract_frozen():
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    spec = c.get("/openapi.json").json()
    got = {(m.upper(), p) for p, ops in spec["paths"].items() for m in ops}
    assert FROZEN_PATHS <= got, f"contract drift: missing {FROZEN_PATHS - got}"
    comps = spec["components"]["schemas"]
    for name in ("SessionRequest", "SessionStatus", "FinalDecision"):
        assert name in comps, f"endpoint schema {name} missing from contract"

def test_agent_schemas_and_ts_client():
    import json as _json
    import os
    import subprocess
    import sys
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assert _json.load(open(os.path.join(root, "contract", "schemas.json"))) is not None
    schemas = _json.load(open(os.path.join(root, "contract", "schemas.json")))
    for name in ("AnalystReport", "DebateTurn", "Thesis", "Challenge", "TradeProposal",
                 "RiskVerdict", "FinalDecision", "SessionRequest", "SessionStatus"):
        assert name in schemas, f"agent schema {name} missing from contract/schemas.json"
    subprocess.run([sys.executable, "scripts/gen_ts_client.py"], cwd=root, check=True,
                   capture_output=True)
    ts = open(os.path.join(root, "frontend-client", "client.ts"), encoding="utf-8").read()
    for sym in ("interface FinalDecision", "interface Thesis", "class AgenticOSClient",
                "subscribeSessionEvents", "interface StageEvent"):
        assert sym in ts, f"generated client missing {sym}"

def test_ws_streams_live_stage_events(monkeypatch):
    install_mocks(monkeypatch)
    from app.db import sqlite_conn
    sqlite_conn().execute("DELETE FROM sessions WHERE instrument='WSTEST.NS'")
    sqlite_conn().execute("DELETE FROM theses WHERE instrument='WSTEST.NS'")
    sqlite_conn().commit()
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    sid = c.post("/api/v1/sessions",
                 json={"instrument": "WSTEST.NS", "as_of": "2024-06-10T00:00:00Z",
                       "interval": "1d", "force_rerun": True}).json()["id"]
    assert c.get(f"/api/v1/sessions/{sid}").json()["status"] == "done"
    frames = []
    with c.websocket_connect(f"/api/v1/sessions/{sid}/events") as ws:
        try:
            while True:
                frames.append(json.loads(ws.receive_text()))
        except Exception:
            pass  # close = stream complete
    stages = {(f["stage"], f["agent"]) for f in frames}
    assert ("analyst", "team") in stages and ("debate", "bull_bear") in stages
    assert ("challenge", "devils_advocate") in stages and ("risk", "panel") in stages
    assert frames[-1]["status"] == "done"  # terminal frame last
    assert len(frames) >= 8

def test_ws_unknown_session_errors():
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    with c.websocket_connect("/api/v1/sessions/nope/events") as ws:
        first = json.loads(ws.receive_text())
        assert first["status"] == "error"
