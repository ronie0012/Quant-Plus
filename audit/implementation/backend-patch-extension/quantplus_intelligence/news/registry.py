"""Connector registry: typed status, request budgets and circuit breakers per news source."""
from __future__ import annotations

import time
import json
import sqlite3
import threading
from pathlib import Path
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field

from ..common import utcnow
from ..config import config


@dataclass
class ConnectorState:
    name: str
    kind: str
    entitlement: str
    max_requests_per_minute: int
    calls: list[float] = field(default_factory=list)
    consecutive_failures: int = 0
    open_until: float = 0.0
    last_success_at: str | None = None
    last_failure_at: str | None = None
    last_error: str | None = None
    empty_results: int = 0
    successes: int = 0
    failures: int = 0

    def snapshot(self):
        now = time.monotonic()
        status = ("circuit_open" if now < self.open_until else
                  "degraded" if self.consecutive_failures else "available")
        return {"name": self.name, "kind": self.kind, "entitlement": self.entitlement,
                "status": status, "consecutive_failures": self.consecutive_failures,
                "last_success_at": self.last_success_at, "last_failure_at": self.last_failure_at,
                "last_error": self.last_error, "successes": self.successes, "failures": self.failures,
                "empty_results": self.empty_results,
                "budget_per_minute": self.max_requests_per_minute}


class ConnectorRegistry:
    def __init__(self, path=None):
        self.connectors: dict[str, ConnectorState] = {}
        self.path = Path(path) if path else None
        self.lock = threading.RLock()
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(self.path, timeout=10) as db:
                db.execute("PRAGMA journal_mode=WAL")
                db.execute("CREATE TABLE IF NOT EXISTS news_connector_state (name TEXT PRIMARY KEY, state TEXT NOT NULL)")

    @contextmanager
    def operation(self, name, clock=time.monotonic):
        # Persistent updates serialize across threads and processes, so two
        # workers cannot each consume a full independent request budget.
        with self.lock:
            state = self.connectors[name]
            if self.path is None:
                yield state
                return
            with sqlite3.connect(self.path, timeout=10) as db:
                db.execute("PRAGMA synchronous=FULL")
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT state FROM news_connector_state WHERE name=?", (name,)).fetchone()
                now, wall = clock(), time.time()
                if row:
                    stored = json.loads(row[0])
                    for key in ("consecutive_failures", "last_success_at", "last_failure_at", "last_error", "empty_results", "successes", "failures"):
                        setattr(state, key, stored[key])
                    state.calls = [now - max(0, wall - item) for item in stored["calls_wall"] if wall - item < 60]
                    state.open_until = now + max(0, stored["open_until_wall"] - wall)
                yield state
                now, wall = clock(), time.time()
                stored = asdict(state)
                stored["calls_wall"] = [wall - (now - item) for item in state.calls if now - item < 60]
                stored["open_until_wall"] = wall + max(0, state.open_until - now)
                del stored["calls"]
                del stored["open_until"]
                db.execute("INSERT INTO news_connector_state VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET state=excluded.state", (name, json.dumps(stored)))

    def register(self, name, kind, entitlement, max_requests_per_minute):
        self.connectors.setdefault(name, ConnectorState(name, kind, entitlement, max_requests_per_minute))
        with self.operation(name):
            pass
        return self.connectors[name]

    def admit(self, name, clock=time.monotonic) -> str | None:
        """Return a refusal reason, or None when a request may proceed."""
        with self.operation(name, clock) as state:
            now = clock()
            if now < state.open_until:
                return "circuit_open"
            state.calls = [t for t in state.calls if now - t < 60]
            if len(state.calls) >= state.max_requests_per_minute:
                return "budget_exhausted"
            state.calls.append(now)
            return None

    def success(self, name, empty=False):
        with self.operation(name) as state:
            state.consecutive_failures = 0
            state.open_until = 0
            state.successes += 1
            state.empty_results += int(empty)
            state.last_success_at = utcnow().isoformat()

    def failure(self, name, error, clock=time.monotonic):
        with self.operation(name, clock) as state:
            state.consecutive_failures += 1
            state.failures += 1
            state.last_failure_at = utcnow().isoformat()
            state.last_error = error
            # Cap the exponent too: an arbitrarily long outage must not construct huge integers.
            if state.consecutive_failures >= 3:
                state.open_until = clock() + min(600, 15 * 2 ** min(6, state.consecutive_failures - 3))

    def status(self):
        result = []
        for name in list(self.connectors):
            with self.operation(name) as state:
                result.append({**state.snapshot(), "persistent": self.path is not None})
        return result


registry = ConnectorRegistry(config.news_archive_path or None)
registry.register("google_news", "rss_discovery", "public RSS headlines", 30)
registry.register("nse_announcements", "official_filings", "public NSE announcement metadata", 20)
