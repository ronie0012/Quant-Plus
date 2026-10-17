"""Website adapter over the existing research graph, with bounded, shared runs."""
from __future__ import annotations

import hashlib
import json
import re
import threading
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
import csv

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from app import control
from app.agents import graph as G
from app.config import settings
from app.db import sqlite_conn


def website_auth(x_quantplus_key: str = Header(default="")):
    import secrets
    if not settings.WEBSITE_API_KEY:
        raise HTTPException(503, "Website API authentication is not configured")
    if not secrets.compare_digest(
            x_quantplus_key, settings.WEBSITE_API_KEY):
        raise HTTPException(401, "Invalid website API key")


router = APIRouter(prefix="/api/v1/stocks", dependencies=[Depends(website_auth)])
_lock = threading.Lock()
_slots = threading.BoundedSemaphore(max(1, settings.STOCK_PREDICTION_MAX_CONCURRENT))
_active_sessions: set[str] = set()
_recent_symbols: dict[str, None] = {}
_warm_retry_after: dict[str, float] = {}


def prediction_config() -> str:
    return "website:" + hashlib.sha256(
        f"{settings.ANALYST_MODEL}|{settings.DECIDER_MODEL}|{settings.PROMPT_VERSION}|"
        f"{settings.DIRECTION_POLICY}|1d|grounding-v2".encode()).hexdigest()[:12]


def _age(as_of: str) -> float:
    return (datetime.now(timezone.utc) - datetime.fromisoformat(as_of)).total_seconds()


def _completed(instrument: str, cfg: str):
    return sqlite_conn().execute(
        "SELECT id, as_of FROM sessions WHERE instrument=? AND config_hash=? "
        "AND status='done' AND decision IS NOT NULL ORDER BY as_of DESC LIMIT 1",
        (instrument, cfg)).fetchone()


def _serving(view: dict, refresh: str = "idle") -> dict:
    age = _age(view["as_of"])
    view["serving"] = {"freshness": "fresh" if age < max(60, settings.STOCK_PREDICTION_REFRESH_SECONDS) else "stale",
                       "age_seconds": round(age, 2), "refresh_status": refresh,
                       "data_cutoff": view["as_of"], "mode": "full_research"}
    return view


def _snapshot(instrument: str, cfg: str, refresh: str = "idle") -> dict | None:
    row = _completed(instrument, cfg)
    if not row or not 0 <= _age(row[1]) < max(60, settings.STOCK_PREDICTION_MAX_STALE_SECONDS):
        return None
    value = _serving(session_view(row[0], include_previous=False), refresh)
    if refresh != "idle" or value["serving"]["freshness"] == "stale":
        value["refresh_seconds"] = 60
    return value


def stock_symbol(value: str) -> str:
    value = value.upper().removesuffix(".NS")
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9&-]{0,29}", value):
        raise HTTPException(422, "Expected an NSE equity symbol, e.g. RELIANCE")
    return value


@lru_cache(maxsize=1)
def stock_catalog() -> list[dict]:
    path = Path(__file__).resolve().parents[2] / "data" / "nifty500.csv"
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as source:
        return [{"symbol": row["Symbol"], "company": row["Company Name"],
                 "sector": row["Industry"]} for row in csv.DictReader(source)
                if row.get("Symbol")]


@router.get("/search")
def search_stocks(q: str = ""):
    needle = q.strip().upper()[:80]
    if len(needle) < 2:
        return {"stocks": []}
    matches = [row for row in stock_catalog()
               if needle in row["symbol"] or needle in row["company"].upper()]
    matches.sort(key=lambda row: (row["symbol"] != needle, not row["symbol"].startswith(needle), row["symbol"]))
    return {"stocks": matches[:20]}


@router.get("/universe")
async def universe():
    """Return the current official NIFTY 50 membership used by live analytics."""
    from quantplus_intelligence.market_data import market_data

    membership = await market_data.universe()
    catalog = {row["symbol"]: row for row in stock_catalog()}
    stocks = []
    for index, symbol in enumerate(membership.get("symbols", [])):
        row = catalog.get(symbol, {})
        stocks.append({
            "symbol": symbol,
            "company": row.get("company") or symbol,
            "sector": row.get("sector") or membership.get("industries", {}).get(symbol) or "NSE equity",
            "index": index + 1,
        })
    return {
        "universe": "NIFTY_50",
        "stocks": stocks,
        "source": membership.get("source"),
        "data_quality": membership.get("data_quality", "DEGRADED"),
        "updated_at": membership.get("updated_at"),
    }


@router.get("/predictions")
def prediction_snapshots(symbols: str):
    """Read-only preload: no model calls, no speculative jobs on hover."""
    names = list(dict.fromkeys(stock_symbol(value.strip()) for value in symbols.split(",")))
    if not 1 <= len(names) <= 50:
        raise HTTPException(422, "Request between 1 and 50 NSE symbols")
    cfg = prediction_config()
    return {"predictions": {name: value for name in names
                            if (value := _snapshot(name + ".NS", cfg)) is not None}}


@router.get("/{symbol}/prediction")
def prediction_snapshot(symbol: str):
    value = _snapshot(stock_symbol(symbol) + ".NS", prediction_config())
    if value is None:
        raise HTTPException(404, "No completed research is available yet")
    return value


@router.get("/{symbol}/profile")
async def stock_profile(symbol: str):
    from app.data.live_market import market
    symbol = stock_symbol(symbol)
    known = next((row for row in stock_catalog() if row["symbol"] == symbol), None)
    from app.data.fyers_provider import fyers
    if fyers.token():
        try:
            raw = await fyers.snapshot(symbol)
            return {"symbol": symbol, "company": raw.get("short_name") or raw.get("description") or (known or {}).get("company") or symbol,
                    "sector": (known or {}).get("sector", "NSE equity"), "exchange": "NSE"}
        except Exception:
            pass
    try:
        result = await market.yahoo_chart(symbol)
    except Exception:
        raise HTTPException(502, "Could not verify this NSE symbol with the market provider. Check the symbol or retry.")
    meta = result.get("meta", {})
    if meta.get("instrumentType") != "EQUITY":
        raise HTTPException(422, "This page supports NSE equities")
    return {"symbol": symbol,
            "company": meta.get("longName") or meta.get("shortName") or (known or {}).get("company") or symbol,
            "sector": (known or {}).get("sector", "NSE equity"), "exchange": "NSE"}


def session_view(sid: str, include_previous: bool = True) -> dict:
    conn = sqlite_conn()
    row = conn.execute(
        "SELECT instrument, as_of, status, decision, config_hash FROM sessions WHERE id=?", (sid,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    checkpoints = {r[0]: json.loads(r[1]) for r in conn.execute(
        "SELECT stage, payload FROM checkpoints WHERE session_id=? AND stage IN "
        "('analysts','thesis','challenge','proposal','risk') OR "
        "(session_id=? AND stage LIKE 'analyst:%')", (sid, sid)).fetchall()}
    reports = dict(checkpoints.get("analysts", {}))
    reports.update({stage.removeprefix("analyst:"): report for stage, report in checkpoints.items()
                    if stage.startswith("analyst:")})
    previous = None
    if include_previous and row[2] != "done":
        completed = conn.execute(
            "SELECT id, as_of FROM sessions WHERE instrument=? AND config_hash=? "
            "AND status='done' AND decision IS NOT NULL AND id<>? ORDER BY as_of DESC LIMIT 1",
            (row[0], row[4], sid)).fetchone()
        if completed and 0 <= _age(completed[1]) < max(60, settings.STOCK_PREDICTION_MAX_STALE_SECONDS):
            previous = _serving(session_view(completed[0], include_previous=False), "running")
    return {"id": sid, "instrument": row[0], "as_of": row[1], "status": row[2],
            "decision": json.loads(row[3]) if row[3] else None,
            "reports": reports, "previous_result": previous,
            "thesis": checkpoints.get("thesis"), "challenge": checkpoints.get("challenge"),
            "proposal": checkpoints.get("proposal"),
            "events": G.session_events(sid), "analysis_interval": "1d",
            "refresh_seconds": max(60, settings.STOCK_PREDICTION_REFRESH_SECONDS)}


def _run(sid: str, instrument: str, as_of: datetime):
    try:
        G.run_session(sid, instrument, as_of, "1d")
    except Exception:
        # graph records the terminal error; never leak provider credentials.
        conn = sqlite_conn()
        conn.execute("UPDATE sessions SET status=? WHERE id=? AND status NOT LIKE 'failed%'",
                     ("failed: analysis unavailable", sid))
        conn.commit()
        G.log_event(sid, "session", "orchestrator", "failed: analysis unavailable")
    finally:
        with _lock:
            _active_sessions.discard(sid)
        _slots.release()


@router.post("/{symbol}/prediction", status_code=202)
def prediction(symbol: str, bg: BackgroundTasks, retry: bool = False):
    return _prediction(symbol, bg, retry=retry)


def _prediction(symbol: str, bg: BackgroundTasks, retry: bool = False, refresh_ahead: bool = False):
    instrument = stock_symbol(symbol) + ".NS"
    now = datetime.now(timezone.utc)
    ttl = max(60, settings.STOCK_PREDICTION_REFRESH_SECONDS)
    cfg = prediction_config()
    # Actual request time is preserved as the PIT cutoff. The DB cache, rather
    # than a browser-generated timestamp, coalesces all visitors to one run.
    with _lock:
        name = instrument.removesuffix(".NS")
        _recent_symbols.pop(name, None)
        _recent_symbols[name] = None
        if len(_recent_symbols) > 200:
            _recent_symbols.pop(next(iter(_recent_symbols)))
        conn = sqlite_conn()
        row = conn.execute(
            "SELECT id, as_of, status FROM sessions WHERE instrument=? AND config_hash=? "
            "ORDER BY as_of DESC LIMIT 1", (instrument, cfg)).fetchone()
        if row:
            age = (now - datetime.fromisoformat(row[1])).total_seconds()
            orphaned = row[2] in ("running", "queued") and row[0] not in _active_sessions
            due_early = refresh_ahead and row[2] == "done" and age >= max(60, ttl - max(0, settings.STOCK_PREDICTION_WARM_AHEAD_SECONDS))
            if not due_early and not orphaned and (age < ttl or row[2] in ("running", "queued")) and not (
                    retry and row[2].startswith("failed")):
                return _serving(session_view(row[0]), "running" if row[2] in ("running", "queued") else "idle")
        if control.is_engaged():
            cached = _snapshot(instrument, cfg, "paused")
            if cached:
                return cached
            raise HTTPException(503, "Analysis paused by the operator")
        if not settings.codecraft_keys():
            cached = _snapshot(instrument, cfg, "unavailable")
            if cached:
                return cached
            raise HTTPException(503, "Agent model credentials are not configured on the backend")
        if not _slots.acquire(blocking=False):
            cached = _snapshot(instrument, cfg, "capacity")
            if cached:
                return cached
            raise HTTPException(429, "Analysis capacity is busy; retry shortly")
        resume = row and ((retry and row[2].startswith("failed")) or
                         (row[2] in ("running", "queued") and row[0] not in _active_sessions))
        as_of = datetime.fromisoformat(row[1]) if resume else now
        sid = row[0] if resume else G.new_session_id(instrument, now.isoformat(), cfg)
        try:
            if resume:
                conn.execute("UPDATE sessions SET status='queued', decision=NULL WHERE id=?", (sid,))
            else:
                conn.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?)",
                             (sid, instrument, now.isoformat(), cfg, "queued", None))
            conn.commit()
            _active_sessions.add(sid)
            bg.add_task(_run, sid, instrument, as_of)
        except Exception:
            _active_sessions.discard(sid)
            _slots.release()
            raise
    return _serving(session_view(sid), "running")


@router.get("/sessions/{sid}")
def stock_session(sid: str):
    view = session_view(sid)
    # A status poll must not claim a persisted run is still working after its
    # process exited. Explicit retry can resume its existing checkpoints.
    if view["status"] in ("queued", "running") and sid not in _active_sessions:
        view["status"] = "failed: backend restarted; retry to resume"
    return view


def warm_next(cursor: int = 0) -> tuple[int, BackgroundTasks]:
    """One full research job at a time; leave a slot for foreground visitors."""
    bg = BackgroundTasks()
    import time
    if not settings.STOCK_PREDICTION_WARM_ENABLED or control.is_engaged() or not settings.codecraft_keys():
        return cursor, bg
    # Warming must not consume the whole account budget before a visitor arrives.
    fraction = min(1.0, max(0.0, settings.STOCK_PREDICTION_WARM_DAY_TOKEN_FRACTION))
    usage = sqlite_conn().execute("SELECT tokens FROM usage_daily WHERE day=?",
                                 (datetime.now().date().isoformat(),)).fetchone()
    if (usage[0] if usage else 0) >= settings.DAY_TOKEN_CAP * fraction:
        return cursor, bg
    configured = [stock_symbol(s.strip()) for s in settings.STOCK_PREDICTION_WARM_SYMBOLS.split(",") if s.strip()]
    with _lock:
        names = list(dict.fromkeys(configured + list(reversed(_recent_symbols))))
        # For a single-slot installation, foreground still coalesces into a warm run.
        capacity = max(1, settings.STOCK_PREDICTION_MAX_CONCURRENT - 1)
        if len(_active_sessions) >= capacity or not names:
            return cursor, bg
    for offset in range(len(names)):
        index = (cursor + offset) % len(names)
        symbol = names[index]
        if time.monotonic() < _warm_retry_after.get(symbol, 0):
            continue
        conn = sqlite_conn()
        row = conn.execute("SELECT as_of, status FROM sessions WHERE instrument=? AND config_hash=? ORDER BY as_of DESC LIMIT 1",
                           (symbol + ".NS", prediction_config())).fetchone()
        ttl = max(60, settings.STOCK_PREDICTION_REFRESH_SECONDS)
        if row and row[1] == "done" and _age(row[0]) < max(60, ttl - max(0, settings.STOCK_PREDICTION_WARM_AHEAD_SECONDS)):
            continue
        # Failed provider jobs back off; never create a billing retry storm.
        if row and row[1].startswith("failed") and _age(row[0]) < ttl:
            continue
        try:
            _prediction(symbol, bg, retry=True, refresh_ahead=True)
        except HTTPException:
            continue
        if bg.tasks:
            return (index + 1) % len(names), bg
    return (cursor + 1) % len(names), bg


async def warm_predictions():
    import asyncio
    import logging
    import time
    cursor = 0
    while True:
        try:
            cursor, tasks = await asyncio.to_thread(warm_next, cursor)
            await tasks()
            for task in tasks.tasks:
                sid, instrument, _ = task.args
                # Timestamp the completed attempt, not its original PIT cutoff.
                row = await asyncio.to_thread(lambda: sqlite_conn().execute(
                    "SELECT status FROM sessions WHERE id=?", (sid,)).fetchone())
                if row and row[0].startswith("failed"):
                    _warm_retry_after[instrument.removesuffix(".NS")] = time.monotonic() + max(300, settings.STOCK_PREDICTION_REFRESH_SECONDS)
                    if len(_warm_retry_after) > 200:
                        _warm_retry_after.pop(next(iter(_warm_retry_after)))
        except asyncio.CancelledError:
            raise
        except Exception:
            logging.getLogger(__name__).warning("Prediction warming paused after a service error")
        await asyncio.sleep(max(5, settings.STOCK_PREDICTION_WARM_INTERVAL_SECONDS))
