from fastapi.testclient import TestClient
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
