"""Optional application-owned sentiment snapshot and outcome-maturation scheduler."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta

from .calibration import HORIZONS, completed_bars, evaluate_snapshot, fully_matured
from .common import log, utcnow
from .config import RULES, config
from .exchange_calendar import session_days
from .history import range_start


class SentimentMaturationJob:
    """Mature stored snapshot outcomes from completed NIFTY 50 five-minute bars.

    Runs after the market data it needs exists; unresolved horizons stay null
    and are retried on later runs. Labels are written back with their version.
    """

    def __init__(self, data, repository, delay_seconds: int | None = None):
        self.data = data
        self.repository = repository
        self.delay_seconds = RULES["calibration_tolerance_seconds"] if delay_seconds is None else delay_seconds

    async def run_once(self, now: datetime | None = None):
        now = now or utcnow()
        snapshots = await self.repository.list(range_start("5d", now), now)
        pending = [snapshot for snapshot in snapshots if not fully_matured(snapshot)]
        if not pending:
            return {"pending": 0, "updated": 0}
        bars = await self.data.index_intraday("NIFTY")
        if bars.get("source") != "fyers" or not bars.get("candles"):
            return {"pending": len(pending), "updated": 0, "reason": "NIFTY intraday bars unavailable"}
        candles = completed_bars(bars["candles"], bars.get("interval_seconds", 300), now, self.delay_seconds)
        days = session_days((now - timedelta(days=10)).date(), (now + timedelta(days=1)).date())
        updated = 0
        for snapshot in pending:
            before = {name: getattr(snapshot, name) for name in HORIZONS}
            version = snapshot.metadata.get("label_version")
            evaluate_snapshot(snapshot, candles, now=now, session_days=days)
            if before != {name: getattr(snapshot, name) for name in HORIZONS} or version != snapshot.metadata.get("label_version"):
                await self.repository.save(snapshot)
                updated += 1
        log("sentiment_maturation", pending=len(pending), updated=updated)
        return {"pending": len(pending), "updated": updated}


class SentimentSnapshotScheduler:
    """Run the existing engine on a market-hours cadence and mature outcomes.

    The scheduler owns no storage and starts no broker/news client.  A FastAPI
    lifespan, cron adapter, or future worker can call ``run_once`` or manage
    ``run_forever`` without changing the calculation engine.
    """

    def __init__(self, engine, sleep: Callable[[float], Awaitable[None]] = asyncio.sleep, maturation=None):
        self.engine = engine
        self.sleep = sleep
        self.running = False
        self.maturation = maturation
        if self.maturation is None and config.maturation_enabled and hasattr(engine, "history_repository"):
            self.maturation = SentimentMaturationJob(engine.data, engine.history_repository)

    async def run_once(self):
        session = await self.engine.data.session()
        if session != "open":
            return None
        return await self.engine.sentiment()

    async def run_forever(self, stop: asyncio.Event | None = None):
        stop = stop or asyncio.Event()
        self.running = True
        try:
            while not stop.is_set():
                try:
                    await self.run_once()
                except Exception as error:
                    log("sentiment_scheduler_failure", error_type=type(error).__name__)
                if self.maturation is not None and hasattr(self.engine.data, "index_intraday"):
                    try:
                        await self.maturation.run_once()
                    except Exception as error:
                        log("sentiment_maturation_failure", error_type=type(error).__name__)
                try:
                    await asyncio.wait_for(stop.wait(), timeout=config.sentiment_history_interval_seconds)
                except asyncio.TimeoutError:
                    continue
        finally:
            self.running = False
