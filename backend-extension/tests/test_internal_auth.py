import asyncio
import pytest

from quantplus_intelligence.internal_auth import InternalAuthMiddleware


async def _invoke(kind="http", path="/api/v1/killswitch", method="POST", headers=(), key="test-key"):
    called = []
    messages = []

    async def target(scope, receive, send):
        called.append(scope["path"])

    async def receive():
        return {"type": "http.request"}

    async def send(message):
        messages.append(message)

    await InternalAuthMiddleware(target, lambda: key)(
        {"type": kind, "path": path, "method": method, "headers": list(headers)}, receive, send)
    return called, messages


def invoke(**kwargs):
    return asyncio.run(_invoke(**kwargs))


@pytest.mark.parametrize("path", ["/api/v1/killswitch", "/api/v1/sessions", "/api/v1/eval/run",
                                  "/api/v1/arena/founders", "/api/v1/research/hypotheses",
                                  "/api/terminal/research", "/openapi.json"])
def test_rejects_before_handler(path):
    called, messages = invoke(path=path)
    assert not called
    assert messages[0]["status"] == 401


@pytest.mark.parametrize("path", ["/api/v1/sessions/private/events", "/api/v1/arena/events"])
def test_websocket_does_not_accept_unauthorized_connection(path):
    called, messages = invoke(kind="websocket", path=path)
    assert not called
    assert messages == [{"type": "websocket.close", "code": 1008,
                         "reason": "Internal authentication required"}]
    called, messages = invoke(kind="websocket", path=path, headers=[(b"x-quantplus-key", b"test-key")])
    assert called == [path]


def test_config_missing_wrong_and_duplicate_credentials():
    for headers, key, status in [([], "", 503), ([(b"x-quantplus-key", b"wrong")], "test-key", 401),
                                 ([(b"x-quantplus-key", b"test-key")] * 2, "test-key", 401)]:
        called, messages = invoke(headers=headers, key=key)
        assert not called
        assert messages[0]["status"] == status
    called, messages = invoke(headers=[(b"x-quantplus-key", b"test-key")])
    assert called == ["/api/v1/killswitch"]


@pytest.mark.parametrize("path", ["/api/v1/health", "/fyers/callback", "/api/v1/fyers/callback"])
def test_only_exact_public_get_exceptions(path):
    called, _ = invoke(path=path, method="GET", key="")
    assert called == [path]
    called, messages = invoke(path=path, method="POST")
    assert not called
    assert messages[0]["status"] == 401
    called, _ = invoke(path=path + "/anything", method="GET")
    assert not called
