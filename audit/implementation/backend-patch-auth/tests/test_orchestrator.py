"""Orchestrator + research API + reproduce tests (Phase 7). Hermetic."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.db import sqlite_conn
from app.research import orchestrator as ORC
from app.research_memory import store as ST


@pytest.fixture(autouse=True)
def _clean():
    from app.evo import champion as CH
    ST.init_tables()
    CH.init_tables()
    yield
    db = sqlite_conn()
    db.execute("DELETE FROM research_hypotheses WHERE body LIKE '%TEST-ORC%'")
    db.execute("DELETE FROM research_experiments WHERE body LIKE '%TEST-ORC%'")
    db.execute("DELETE FROM research_corpses WHERE body LIKE '%TEST-ORC%'")
    db.execute("DELETE FROM strategy_pool WHERE fp LIKE 'TEST-%'")
    db.execute("DELETE FROM champion_history WHERE fp LIKE 'TEST-%'")
    db.commit()


def _hypo(hid, thesis_extra=""):
    return {"hypothesis_id": hid, "title": "TEST-ORC veto title here",
            "thesis": ("TEST-ORC veto interaction thesis with enough words to pass "
                       "validation floors. " + thesis_extra),
            "economic_reason": "TEST-ORC rationale with enough words here.",
            "strategy_family": "veto_filter", "required_features": ["delivery_z"],
            "claimed_mechanism": "TEST-ORC mechanism",
            "falsification_tests": ["placebo"],
            "novelty_claim": "TEST-ORC novelty claim here.",
            "estimated_research_cost": 50.0}


def _propose(role, brief):
    if role == "factor":
        return [_hypo("TEST-ORC-H1"), _hypo("TEST-ORC-H1")]  # exact duplicate pair
    if role == "microstructure":
        return [{"hypothesis_id": "TEST-ORC-BAD", "title": "x"}]  # schema reject
    if role == "failure_analysis":
        raise RuntimeError("role down")  # must not kill the cycle
    return []


def test_cycle_routes_and_queues(tmp_path):
    rec = ORC.run_cycle("TEST-ORC delivery veto", _propose,
                        manifest_dir=str(tmp_path))
    assert rec["n_briefs"] == 5 and rec["dataset"].startswith("forward")
    stored = [s for s in rec["submissions"] if s.get("stored")]
    dups = [s for s in rec["submissions"] if s.get("status") == "DUPLICATE"]
    assert len(stored) == 1 and len(dups) == 1
    assert len(rec["rejected_schema"]) == 1
    assert rec["role_errors"]  # failure_analysis error recorded, cycle survived
    assert rec["queue"] == ["TEST-ORC-H1"] and len(rec["experiments"]) == 1
    assert rec["plans"][stored[0]["fp"]]["required"]
    man = json.loads(open(rec["manifests"][0], encoding="utf-8").read())
    assert man["experiment_id"] == rec["experiments"][0]
    assert man["gate_version"] == "GATESET_FROZEN_20260918"
    assert man["dataset_status"] == "forward-only"
    assert rec["ledger"]["estimated_cost"] == 50.0


def test_cycle_compiles_embedded_dsl(tmp_path):
    def propose(role, brief):
        if role != "factor":
            return []
        h = _hypo("TEST-ORC-H2")
        h["dsl"] = {"ops": [{"op": "VETO", "params": {
            "band_lo": 0.5, "band_hi": 0.75, "veto": 1.0}}]}
        return [h]
    rec = ORC.run_cycle("TEST-ORC dsl", propose, manifest_dir=str(tmp_path))
    fp = [s["fp"] for s in rec["submissions"] if s.get("stored")][0]
    assert rec["compiled"][fp].startswith("strat-")


def test_research_api_surface():
    from app.evo import champion as CH
    from app.main import app
    CH.set_genesis("TEST-ORC-GEN", "genesis", {})
    client = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    r = client.post("/api/v1/research/hypotheses",
                    json={"hypothesis": _hypo("TEST-ORC-API")})
    assert r.status_code == 200 and r.json()["stored"] is True
    r2 = client.post("/api/v1/research/hypotheses",
                     json={"hypothesis": _hypo("TEST-ORC-API")})
    assert r2.json()["status"] == "DUPLICATE"
    bad = client.post("/api/v1/research/hypotheses", json={"hypothesis": {"a": 1}})
    assert bad.status_code == 422
    assert client.get("/api/v1/research/champion").status_code == 200
    assert "challengers" in client.get("/api/v1/research/challengers").json()
    assert client.get("/api/v1/research/corpses").status_code == 200
    tree = client.get("/api/v1/research/lineage/TEST-ORC-NONE").json()
    assert tree == {"fp": "TEST-ORC-NONE", "children": []}


def test_reproduce_unknown_and_known(tmp_path):
    import sys
    sys.path.insert(0, "scripts")
    from reproduce_experiment import reproduce
    assert reproduce("EXP-DOES-NOT-EXIST")["found"] is False
    rec = ORC.run_cycle("TEST-ORC repro", lambda role, brief: (
        [_hypo("TEST-ORC-R1")] if role == "factor" else []),
        manifest_dir=str(tmp_path))
    rep = reproduce(rec["experiments"][0], manifest_dir=str(tmp_path))
    assert rep["found"] is True and rep["checks"]["hypothesis_fp_match"] is True
    assert rep["checks"]["manifest_present"] is True
    assert rep["checks"]["bars_reconstructed"] is False
