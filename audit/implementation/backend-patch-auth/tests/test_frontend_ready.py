"""Day 6 frontend-readiness: CORS, kill switch, arena surface, audit export.

Zero tokens / zero network: session creation is mocked where it would bill, and
every evo row lives in the hermetic per-session temp DB (see conftest.py).
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import control
from app.db import sqlite_conn
from app.main import app


@pytest.fixture(autouse=True)
def _clean_control_and_evo():
    """Isolate the shared temp DB: no founders/kill-switch state leaks between tests."""
    def wipe():
        db = sqlite_conn()
        for t in ("evo_variants", "evo_windows", "evo_tombstones", "evo_lineage",
                  "evo_events", "control_state"):
            try:
                db.execute(f"DELETE FROM {t}")
            except Exception:
                pass  # table not created yet
        db.commit()
    wipe()
    yield
    wipe()


def test_cors_preflight_allows_frontend_origin():
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    r = c.options("/api/v1/sessions", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
    })
    assert r.status_code in (200, 204)
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_kill_switch_halts_and_releases(monkeypatch):
    import app.api.v1 as v1
    monkeypatch.setattr(v1, "_run_session", lambda *a, **k: None)
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    assert c.get("/api/v1/killswitch").json()["engaged"] is False

    on = c.post("/api/v1/killswitch", json={"engage": True, "reason": "drill"}).json()
    assert on["engaged"] is True and on["reason"] == "drill"
    blocked = c.post("/api/v1/sessions", json={
        "instrument": "KS.NS", "as_of": "2024-06-01T00:00:00Z", "force_rerun": True})
    assert blocked.status_code == 503
    # a halted system also refuses new population admissions
    assert c.post("/api/v1/arena/founders").status_code == 503

    off = c.post("/api/v1/killswitch", json={"engage": False}).json()
    assert off["engaged"] is False
    monkeypatch.setattr(v1, "_run_session", lambda *a, **k: None)
    ok = c.post("/api/v1/sessions", json={
        "instrument": "KS.NS", "as_of": "2024-06-01T00:00:00Z", "force_rerun": True})
    assert ok.status_code == 200


def test_arena_bootstrap_is_idempotent_and_state_renders():
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    first = c.post("/api/v1/arena/founders").json()
    assert len(first["born"]) == 8 and len(first["living"]) == 8
    second = c.post("/api/v1/arena/founders").json()
    assert second["born"] == [] and len(second["living"]) == 8

    state = c.get("/api/v1/arena").json()
    assert len(state["living"]) == 8 and state["cap"] == 8
    assert abs(sum(state["allocation"].values()) - 1.0) < 1e-9
    assert {v["status"] for v in state["living"]} == {"ALIVE"}


def test_arena_events_log_and_ws_stream():
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    c.post("/api/v1/arena/founders")
    events = c.get("/api/v1/arena/events").json()["events"]
    assert len(events) == 8 and all(e["event"] == "birth" for e in events)

    frames = []
    with c.websocket_connect("/api/v1/arena/events") as ws:
        for _ in range(8):
            frames.append(json.loads(ws.receive_text()))
    assert len(frames) == 8
    seqs = [f["seq"] for f in frames]
    assert seqs == sorted(seqs) and len(set(seqs)) == 8  # monotonic, one per birth
    assert {f["variant_id"] for f in frames} == {"F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"}


def test_audit_export_shape():
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    c.post("/api/v1/arena/founders")
    body = c.get("/api/v1/audit/export?limit=10").json()
    for key in ("generated_at", "counts", "sessions", "theses", "evo_events",
                "seed_bank", "usage_daily", "control"):
        assert key in body, f"audit export missing {key}"
    assert body["counts"]["evo_tombstones"] == 0
    assert body["control"]["engaged"] is False
