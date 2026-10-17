from fastapi.testclient import TestClient
from app.main import app

def test_health():
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    r = c.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["llm_gateway"] is True
    assert body["analyst_model"] == "deepseek-v4-pro-0813"
    assert body["decider_model"] == "claude-sonnet-5"

def test_session_idempotent(monkeypatch):
    import app.api.v1 as v1
    monkeypatch.setattr(v1, "_run_session", lambda *a, **k: None)  # no live billing in unit test
    c = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})
    payload = {"instrument": "RELIANCE.NS", "as_of": "2024-06-01T00:00:00Z", "interval": "1d",
               "force_rerun": True}
    r1 = c.post("/api/v1/sessions", json=payload)
    r2 = c.post("/api/v1/sessions", json={**payload, "force_rerun": False})
    assert r1.json()["id"] == r2.json()["id"]
