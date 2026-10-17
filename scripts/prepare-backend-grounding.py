"""Prepare reviewed research validation changes without touching the active backend."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parents[1]
backend = Path("D:/QP/agent-service")
output = root / "audit/implementation/backend-patch-grounding"
manifest = []


def save(relative, source):
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(source, encoding="utf-8", newline="")
    original = backend / relative
    manifest.append({"path": relative,
                     "before_sha256": hashlib.sha256(original.read_bytes()).hexdigest() if original.exists() else None,
                     "after_sha256": hashlib.sha256(target.read_bytes()).hexdigest()})


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise SystemExit(f"Backend anchor changed: {old[:80]}")
    return source.replace(old, new, 1)


save("quantplus_intelligence/research_grounding.py",
     (root / "backend-extension/quantplus_intelligence/research_grounding.py").read_text(encoding="utf-8"))
utility = (backend / "app/agents/_util.py").read_text(encoding="utf-8")
utility = replace_once(utility, '    fixed = fixed or {}\n    prompt = user', '''    fixed = fixed or {}
    if schema.__name__ == "AnalystReport":
        grounding = user if grounding is None else grounding
        system += (" Numeric signals must copy exact field names and signed values from key=value facts. "
                   "Use those same field names in summary claims, preserving percent units. "
                   "If no typed numeric facts are supplied, return signals=[] and a qualitative abstention. "
                   "Never invent evidence refs; refs must occur verbatim in the supplied context.")
    prompt = user''')
utility = replace_once(utility, '''                claims.remember(session_id, fixed.get("agent", role), claims.audit(result, grounding, as_of))''', '''                from quantplus_intelligence.research_grounding import validate_report
                validation = validate_report(result, grounding, as_of)
                claims.remember(session_id, fixed.get("agent", role), validation)
                if validation["status"] != "verified":
                    raise ValueError("Unsupported research claims; correct or abstain: " + json.dumps(validation))''')
utility = utility.replace("# Record (never rewrite) numbers and evidence the provided data does not support.",
                          "# Reject unsupported research before reports reach synthesis or checkpoints.")
save("app/agents/_util.py", utility)
for relative, old, new in [
    ("app/agents/technical.py", 'S.AnalystReport, {"agent": "technical"})', 'S.AnalystReport, {"agent": "technical"}, grounding=user, as_of=as_of)'),
    ("app/agents/events_analyst.py", 'S.AnalystReport, {"agent": "events"})', 'S.AnalystReport, {"agent": "events"}, grounding=user, as_of=as_of)'),
    ("app/api/v1.py", 'f"{settings.DIRECTION_POLICY}".encode()', 'f"{settings.DIRECTION_POLICY}|grounding-v2".encode()'),
    ("app/api/stocks.py", 'f"{settings.DIRECTION_POLICY}|1d".encode()', 'f"{settings.DIRECTION_POLICY}|1d|grounding-v2".encode()'),
]:
    save(relative, replace_once((backend / relative).read_text(encoding="utf-8"), old, new))
save("tests/test_internal_auth_boundary.py", '''from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import pytest
from app.main import app


@pytest.mark.parametrize("path", ["/api/v1/killswitch", "/api/v1/sessions", "/api/v1/eval/run", "/api/v1/arena/founders", "/api/v1/research/hypotheses"])
def test_real_application_rejects_unauthenticated_control(path):
    response = TestClient(app).post(path, json={})
    assert response.status_code == 401


@pytest.mark.parametrize("path", ["/api/v1/arena/events", "/api/v1/sessions/private/events"])
def test_real_application_rejects_unauthenticated_websocket(path):
    with pytest.raises(WebSocketDisconnect) as denied:
        with TestClient(app).websocket_connect(path):
            pytest.fail("unauthenticated websocket accepted")
    assert denied.value.code == 1008
''')
save("tests/test_research_grounding_boundary.py", '''import json
from datetime import datetime, timezone
import pytest
from app import schemas as S
from app.agents import _util


def test_invalid_claims_are_retried_and_never_returned(monkeypatch):
    calls = []
    def invalid(**kwargs):
        calls.append(kwargs)
        return json.dumps({"summary": "The price=500", "signals": [{"name": "price", "value": 500, "direction": "neutral"}], "confidence": .2, "evidence": []})
    monkeypatch.setattr(_util.gateway, "complete_json", invalid)
    with pytest.raises(RuntimeError, match="validation failed twice"):
        _util.call_json("technical", "grounding-test", "system", "price=100 volume=500", S.AnalystReport, {"agent": "technical"}, grounding="price=100 volume=500", as_of=datetime(2026, 10, 14, tzinfo=timezone.utc))
    assert len(calls) == 2
    assert "Unsupported research claims" in calls[1]["user"]
''')
# Update only the shared gateway mock: its old invented numerical signal and
# source did not come from the fixture evidence. A qualitative empty-signal
# report is the correct mock response to an unavailable typed fact.
mocks = (backend / "tests/_mocks.py").read_text(encoding="utf-8")
mocks = replace_once(mocks, '"signals": [{"name": "mom", "value": 0.5, "direction": "bullish"}],', '"signals": [],')
mocks = replace_once(mocks, '''"evidence": [{"source": "test", "ref": "t1",
                                             "available_at": "2024-06-07T00:00:00Z"}]}''', '"evidence": []}')
save("tests/_mocks.py", mocks)
for relative in ["tests/test_eval.py", "tests/test_full_session.py", "tests/test_hardening.py"]:
    source = (backend / relative).read_text(encoding="utf-8")
    source = replace_once(source, '"signals": [{"name": "mom", "value": 0.5, "direction": "bullish"}],', '"signals": [],')
    source, count = re.subn(r'"evidence": \[\{"source": "test", "ref": "t1",\s*"available_at": "2024-06-07T00:00:00Z"\}\]', '"evidence": []', source)
    if count != 1:
        raise SystemExit(f"Inspect mock evidence in {relative}")
    save(relative, source)
(output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Prepared {len(manifest)} files at {output}")
