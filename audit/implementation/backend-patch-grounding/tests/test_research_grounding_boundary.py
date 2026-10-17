import json
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
