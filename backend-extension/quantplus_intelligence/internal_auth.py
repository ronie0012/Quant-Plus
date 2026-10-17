"""Fail-closed HTTP and WebSocket boundary for the entire internal service.

The only unauthenticated GETs are liveness and the state-validated Fyers
callbacks. Credentials are accepted only in headers, never in logged URLs.
"""
from __future__ import annotations

import json
import secrets


PUBLIC_GETS = frozenset({"/api/v1/health", "/health", "/fyers/callback", "/api/v1/fyers/callback"})


class InternalAuthMiddleware:
    def __init__(self, app, key=None):
        self.app = app
        self.key = key

    async def __call__(self, scope, receive, send):
        kind = scope["type"]
        if kind not in {"http", "websocket"}:
            return await self.app(scope, receive, send)
        if kind == "http" and scope.get("method") == "GET" and scope.get("path") in PUBLIC_GETS:
            return await self.app(scope, receive, send)
        if self.key is None:
            from app.config import settings
            expected = settings.WEBSITE_API_KEY
        else:
            expected = self.key()
        values = [value for name, value in scope.get("headers", []) if name.lower() == b"x-quantplus-key"]
        authorized = bool(expected) and len(values) == 1 and secrets.compare_digest(
            values[0], expected.encode("utf-8"))
        if authorized:
            return await self.app(scope, receive, send)
        if kind == "websocket":
            await send({"type": "websocket.close", "code": 1008, "reason": "Internal authentication required"})
            return
        status = 401 if expected else 503
        body = json.dumps({"detail": "Invalid internal API key" if expected else
                           "Internal authentication is not configured"}).encode()
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"application/json"),
                                (b"cache-control", b"no-store")]})
        await send({"type": "http.response.body", "body": body})
