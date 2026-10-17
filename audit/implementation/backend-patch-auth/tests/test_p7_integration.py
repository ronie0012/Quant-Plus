"""P7 integration tests: registry, corporate actions, manifests, API surface. Hermetic."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.data import corporate_actions as CA
from app.data import registry as REG
from app.db import sqlite_conn


@pytest.fixture(autouse=True)
def _clean():
    REG.init_tables()
    CA.init_tables()
    yield
    db = sqlite_conn()
    db.execute("DELETE FROM dataset_registry WHERE name LIKE 'TEST-%'")
    db.execute("DELETE FROM dataset_usage WHERE dataset LIKE 'TEST-%'")
    db.execute("DELETE FROM corporate_actions WHERE symbol LIKE 'TEST-%'")
    db.commit()


def test_registry_burn_is_one_way():
    assert REG.register("TEST-DS", "UNSEEN")["state"] == "UNSEEN"
    assert REG.transition("TEST-DS", "DEVELOPMENT")["state"] == "DEVELOPMENT"
    assert REG.transition("TEST-DS", "BURNED")["state"] == "BURNED"
    with pytest.raises(ValueError):
        REG.transition("TEST-DS", "UNSEEN")  # never returns
    with pytest.raises(ValueError):
        REG.transition("TEST-DS", "FORWARD")  # burned cannot become forward
    with pytest.raises(ValueError):
        REG.register("TEST-DS2", "MOON")


def test_access_policy_refuses_burned_promotion():
    REG.register("TEST-BURNED", "BURNED")
    assert REG.check_access("TEST-BURNED", "backtest")["allowed"] is True
    refused = REG.check_access("TEST-BURNED", "promotion")
    assert refused["allowed"] is False and "NOT SUFFICIENT" in refused["note"]
    REG.register("TEST-FWD", "FORWARD")
    assert REG.check_access("TEST-FWD", "promotion")["allowed"] is True
    assert REG.check_access("TEST-NEVER-SEEN", "promotion")["allowed"] is True  # UNSEEN
    REG.record_usage("TEST-FWD", "EXP-1", "promotion")
    assert REG.status_of("TEST-FWD")["usage_count"] == 1


def test_seed_known_idempotent():
    assert REG.seed_known()["total"] >= 10
    assert REG.seed_known()["seeded"] == 0
    assert REG.status_of("forward-from-2026-10-10")["state"] == "FORWARD"


def test_corporate_actions_abstain_when_unknown():
    factor, status = CA.adjustment_factor("TEST-NOPE.NS", "2024-01-01")
    assert (factor, status) == (1.0, "UNKNOWN")
    CA.record(CA.CorporateAction(symbol="TEST-SPLIT.NS", kind="split",
                                 effective_date="2023-06-01", factor=0.5,
                                 source="TEST", verified=True))
    f2, s2 = CA.adjustment_factor("TEST-SPLIT.NS", "2024-01-01")
    assert f2 == 0.5 and s2 == "VERIFIED"
    f1, _ = CA.adjustment_factor("TEST-SPLIT.NS", "2023-01-01")
    assert f1 == 1.0  # pre-effective: no adjustment
    cov = CA.coverage(["TEST-SPLIT.NS", "TEST-NOPE.NS"])
    assert cov["TEST-SPLIT.NS"]["status"] == "VERIFIED"
    assert cov["TEST-NOPE.NS"]["status"] == "UNKNOWN"
    import pydantic
    with pytest.raises(Exception):
        CA.record(CA.CorporateAction(symbol="X", kind="moon",
                                     effective_date="2023-01-01", factor=1.0))


def test_manifest_expansion_fields():
    from app.research.orchestrator import write_manifest
    from app.research.schema import ExperimentProposal, FalsificationPlan
    p = ExperimentProposal(
        hypothesis_id="H", falsification_plan=FalsificationPlan(
            hypothesis_id="H", tests=["placebo"], kill_criteria=["x"],
            max_research_cost=1.0),
        dataset="forward-from-2026-10-10", expected_information_gain=1.0,
        research_cost=1.0, rationale="TEST manifest expansion rationale here.")
    import tempfile, os
    d = tempfile.mkdtemp()
    path = write_manifest("EXP-T", p, "forward-from-2026-10-10",
                          "GATESET_FROZEN_20260918", manifest_dir=d,
                          pit_membership_version="abc123", membership_hash="def456",
                          event_batch_ids=["B1"], taxonomy_version="EVENT_TAXONOMY_V1",
                          evidence_class="RISK_CONTROL")
    man = json.load(open(path, encoding="utf-8"))
    assert man["pit_membership_version"] == "abc123"
    assert man["event_batch_ids"] == ["B1"]
    assert man["evidence_class"] == "RISK_CONTROL"
    assert man["gate_version"] == "GATESET_FROZEN_20260918"


def test_api_audit_surface():
    from app.main import app
    client = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    reg = client.get("/api/v1/research/data-registry").json()
    assert reg["registry_version"] == "registry-v1"
    assert any(d["name"] == "forward-from-2026-10-10" for d in reg["datasets"])
    pit = client.get("/api/v1/research/pit/nifty50/2026-10-01").json()
    assert pit["pit_status"] in ("VERIFIED", "PARTIAL") and pit["n_members"] >= 40
    assert len(pit["membership_hash"]) == 16
    assert client.get("/api/v1/research/pit/nope/2026-10-01").status_code == 422
    cal = client.get("/api/v1/research/calibration").json()
    assert cal["calibration"]["status"] == "INSUFFICIENT_CALIBRATION_SAMPLE"
    assert client.get("/api/v1/research/experiments/EXP-NOPE/evidence").status_code == 404
    assert client.get("/api/v1/research/events").status_code == 200
    assert client.get("/api/v1/research/events/EV-NOPE").status_code == 404
