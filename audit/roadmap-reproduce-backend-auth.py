"""Read-only reproduction on the disposable backend copy made by test:backend.

No lifespan startup, real model keys, provider requests, or control mutations.
Pass the disposable backend directory as the sole argument.
"""
import json
import os
from pathlib import Path
import sys
from unittest.mock import patch

stage = Path(sys.argv[1]).resolve()
if stage.parent != Path(__file__).resolve().parents[1] / ".intelligence-test":
    raise SystemExit("Only a disposable .intelligence-test backend is allowed")
os.environ.update({"CODECRAFT_KEY_1": "offline-test-key-one", "CODECRAFT_KEY_2": "offline-test-key-two",
                   "WEBSITE_API_KEY": "offline-website-test-key", "QP_DB_PATH": str(stage / "auth-repro.db"),
                   "STOCK_PREDICTION_WARM_ENABLED": "false", "INTELLIGENCE_SCHEDULER_ENABLED": "false"})
sys.path.insert(0, str(stage))
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
with patch("app.control.release", return_value={"engaged": False, "reason": "", "updated_ts": None}) as release:
    result = client.post("/api/v1/killswitch", json={"engage": False})
    print(json.dumps({"route": "/api/v1/killswitch", "credentials_sent": False,
                      "http_status": result.status_code, "mock_handler_called": release.called,
                      "actual_mutation": False}))
for route in app.routes:
    if getattr(route, "path", "") in {"/api/v1/sessions", "/api/v1/eval/run", "/api/v1/killswitch",
                                       "/api/v1/research/hypotheses", "/api/v1/sessions/{sid}/events",
                                       "/api/v1/arena/events"}:
        dependencies = getattr(getattr(route, "dependant", None), "dependencies", [])
        print(json.dumps({"route": route.path, "dependency_count": len(dependencies)}))
