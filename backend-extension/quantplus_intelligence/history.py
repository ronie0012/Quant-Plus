"""Sentiment snapshot storage and historical calibration primitives.

The calculation engine only depends on the small repository protocol below.
Durable local history uses SQLite when ``INTELLIGENCE_HISTORY_PATH`` is set;
otherwise history is process-local. The old cloud adapter is archived outside
the runtime source tree; the application uses InsForge for its hosted book.
No live quote ticks are persisted here.
"""
from __future__ import annotations

import asyncio
import json
import sqlite3
import time
from pathlib import Path
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol


from .common import log, utcnow
from .config import config, RULES


@dataclass
class SentimentSnapshot:
    timestamp: str
    score: float | None
    label: str
    confidence: float
    data_quality: str
    regime: str
    components: dict[str, float | None] = field(default_factory=dict)
    alignment_score: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    forward_return_15m: float | None = None
    forward_return_30m: float | None = None
    forward_return_1h: float | None = None
    forward_return_eod: float | None = None
    forward_return_1d: float | None = None

    @classmethod
    def from_result(cls, result: dict[str, Any]) -> "SentimentSnapshot":
        components = {
            name: component.get("score")
            for name, component in result.get("components", {}).items()
        }
        return cls(
            timestamp=result.get("score_as_of") or result.get("updated_at") or utcnow().isoformat(),
            score=result.get("score"),
            label=result.get("label", "UNAVAILABLE"),
            confidence=float(result.get("confidence") or 0),
            data_quality=result.get("data_quality", "DEGRADED"),
            regime=result.get("regime", "MIXED"),
            components=components,
            alignment_score=(result.get("signal_alignment") or {}).get("score"),
            metadata={
                "market_session": result.get("market_session"),
                "market_status": result.get("market_status"),
                "weight_coverage": result.get("weight_coverage"),
                "data_quality_score": result.get("data_quality_score"),
                "divergences": result.get("divergences", []),
                "sector_scores": {name: value.get("score") for name, value in result.get("sectors", {}).items()},
                "nifty_price": result.get("nifty_price"),
                "vix_level": result.get("components", {}).get("india_vix", {}).get("level"),
                "pct_advancing": result.get("components", {}).get("market_breadth", {}).get("pct_advancing"),
                "computed_at": result.get("updated_at"),
            },
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# Outcome labels produced by the current maturation rules. Snapshots carrying
# any other label version (or none) are excluded from calibration statistics.
LABEL_VERSION = "completed-bars-v3"


def label_eligible(snapshot: "SentimentSnapshot") -> bool:
    return snapshot.metadata.get("label_version") == LABEL_VERSION


class SentimentHistoryRepository(Protocol):
    async def save(self, snapshot: SentimentSnapshot) -> None: ...

    async def list(self, since: datetime, until: datetime | None = None) -> list[SentimentSnapshot]: ...


def _timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class InMemorySentimentHistoryRepository:
    def __init__(self, max_snapshots: int | None = None):
        self.max_snapshots = max_snapshots or config.sentiment_history_max_snapshots
        self.snapshots: list[SentimentSnapshot] = []

    async def save(self, snapshot: SentimentSnapshot) -> None:
        # A cached sentiment calculation can be requested repeatedly.  Preserve
        # one observation per timestamp rather than inflating the history.
        self.snapshots = [s for s in self.snapshots if s.timestamp != snapshot.timestamp]
        self.snapshots.append(snapshot)
        self.snapshots.sort(key=lambda item: _timestamp(item.timestamp))
        if len(self.snapshots) > self.max_snapshots:
            self.snapshots = self.snapshots[-self.max_snapshots:]

    async def list(self, since: datetime, until: datetime | None = None) -> list[SentimentSnapshot]:
        until = until or utcnow()
        return [
            snapshot
            for snapshot in self.snapshots
            if since <= _timestamp(snapshot.timestamp) <= until
        ]


class SQLiteSentimentHistoryRepository:
    """Durable local history: one row per observation timestamp.

    Re-saving a timestamp replaces its payload (used when outcomes mature).
    The first observation time is preserved for audit.
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS sentiment_snapshots ("
                " timestamp TEXT PRIMARY KEY, epoch REAL NOT NULL, payload TEXT NOT NULL,"
                " first_saved_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
            connection.execute("CREATE INDEX IF NOT EXISTS sentiment_epoch ON sentiment_snapshots(epoch)")

    def _connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=FULL")
        return connection

    def _save(self, snapshot: "SentimentSnapshot"):
        now = utcnow().isoformat()
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO sentiment_snapshots(timestamp, epoch, payload, first_saved_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?) ON CONFLICT(timestamp) DO UPDATE SET"
                " payload = excluded.payload, updated_at = excluded.updated_at",
                (snapshot.timestamp, _timestamp(snapshot.timestamp).timestamp(),
                 json.dumps(snapshot.to_dict(), default=str), now, now))

    def _list(self, since: datetime, until: datetime | None):
        until = until or utcnow()
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT payload FROM sentiment_snapshots WHERE epoch >= ? AND epoch <= ? ORDER BY epoch",
                (since.timestamp(), until.timestamp())).fetchall()
        return [SentimentSnapshot(**json.loads(row[0])) for row in rows]

    async def save(self, snapshot: "SentimentSnapshot") -> None:
        await asyncio.to_thread(self._save, snapshot)

    async def list(self, since: datetime, until: datetime | None = None) -> list["SentimentSnapshot"]:
        return await asyncio.to_thread(self._list, since, until)


class ResilientSentimentHistoryRepository:
    """Write memory first; persistence outages cannot remove current history."""
    def __init__(self, persistent, memory=None):
        self.persistent = persistent
        self.memory = memory or InMemorySentimentHistoryRepository()
        self.retry_at = 0
        self.read_at = 0

    async def save(self, snapshot):
        await self.memory.save(snapshot)
        if time.monotonic() < self.retry_at:
            return
        try:
            await self.persistent.save(snapshot)
        except Exception as error:
            self.retry_at = time.monotonic() + 60
            log("sentiment_snapshot_persistence_error", error_type=type(error).__name__)

    async def list(self, since, until=None):
        now = time.monotonic()
        if now >= max(self.retry_at, self.read_at):
            try:
                for snapshot in await self.persistent.list(range_start("5d"), until):
                    # Recent local writes win over remote copies.
                    if not any(s.timestamp == snapshot.timestamp for s in self.memory.snapshots):
                        await self.memory.save(snapshot)
                self.read_at = now + 60
            except Exception as error:
                self.retry_at = now + 60
                log("sentiment_history_read_error", error_type=type(error).__name__)
        return await self.memory.list(since, until)


def history_repository():
    if config.history_path:
        return ResilientSentimentHistoryRepository(SQLiteSentimentHistoryRepository(config.history_path))
    return InMemorySentimentHistoryRepository()


def range_start(range_name: str, now: datetime | None = None) -> datetime:
    now = now or utcnow()
    durations = {"1h": timedelta(hours=1), "1d": timedelta(days=1), "5d": timedelta(days=5)}
    if range_name not in durations:
        raise ValueError("range must be one of 1h, 1d, or 5d")
    return now - durations[range_name]


def downsample(snapshots: list[SentimentSnapshot], interval: str | None) -> list[SentimentSnapshot]:
    seconds = {"5m": 300, "15m": 15 * 60, "1h": 60 * 60}.get(interval or "5m")
    if seconds is None:
        raise ValueError("interval must be one of 5m, 15m, or 1h")
    selected: dict[int, SentimentSnapshot] = {}
    for snapshot in snapshots:
        bucket = int(_timestamp(snapshot.timestamp).timestamp()) // seconds
        selected[bucket] = snapshot
    return [selected[key] for key in sorted(selected)]


def historical_signal_reliability(
    snapshots: list[SentimentSnapshot], threshold: float, direction: str, minimum: int | None = None
) -> dict[str, Any] | None:
    """Summarise completed one-hour observations without implying certainty."""
    minimum = max(minimum or 0, RULES["min_reliability_observations"])
    usable = [
        snapshot
        for snapshot in snapshots
        if label_eligible(snapshot)
        and snapshot.score is not None
        and ((snapshot.score >= threshold and direction == "up") or
             (snapshot.score <= threshold and direction == "down"))
        and snapshot.forward_return_1h is not None
    ]
    if len(usable) < minimum:
        return None
    successes = sum(
        (snapshot.forward_return_1h > 0 if direction == "up" else snapshot.forward_return_1h < 0)
        for snapshot in usable
    )
    return {
        "name": "Historical Signal Reliability",
        "direction": direction,
        "threshold": threshold,
        "reliability": round(successes / len(usable) * 100, 1),
        "observations": len(usable),
        "label_version": LABEL_VERSION,
    }
