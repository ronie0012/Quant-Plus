from __future__ import annotations

import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.stocks import website_auth, stock_symbol, prediction_config, session_view
from . import terminal
from .common import utcnow

router = APIRouter(prefix="/terminal", dependencies=[Depends(website_auth)], tags=["Live terminal"])


@router.get("/indices/{symbol}/history")
async def history(symbol: str, range: str = Query("1D", pattern="^(1D|1W|1M|3M|6M|1Y)$")):
    if symbol not in terminal.INDICES:
        raise HTTPException(404, "Unsupported index")
    try:
        return await terminal.index_history(symbol, range)
    except Exception:
        raise HTTPException(502, "Index history unavailable")


@router.get("/quotes")
async def quotes(symbols: str):
    names = list(dict.fromkeys(stock_symbol(s.strip()) for s in symbols.split(",")))
    if not 1 <= len(names) <= 50:
        raise HTTPException(422, "Expected 1 to 50 symbols")
    return await terminal.quotes(names)


@router.get("/metrics")
async def metrics(symbols: str):
    names = list(dict.fromkeys(stock_symbol(s.strip()) for s in symbols.split(",")))
    if not 1 <= len(names) <= 10:
        raise HTTPException(422, "Request at most 10 symbols per factor batch")
    rows = await asyncio.gather(*(terminal.stock_metrics(s) for s in names))
    return {"metrics": {row["symbol"]: row for row in rows}, "updated_at": utcnow().isoformat()}


@router.get("/fundamentals/{symbol}")
async def fundamentals(symbol: str):
    return await terminal.fundamentals(stock_symbol(symbol))


@router.get("/calendar")
async def calendar():
    return await terminal.calendar()


@router.get("/research")
def research(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    from app.db import sqlite_conn
    # Shared symbol research, never portfolio-specific or internal evaluation sessions.
    conn = sqlite_conn()
    cfg = prediction_config()
    rows = conn.execute("SELECT id FROM sessions WHERE config_hash=? AND status='done' AND decision IS NOT NULL ORDER BY as_of DESC LIMIT ? OFFSET ?",
                        (cfg, limit, offset)).fetchall()
    return {"sessions": [session_view(row[0], include_previous=False) for row in rows],
            "scope": "shared_symbol_research", "next_offset": offset+len(rows) if len(rows) == limit else None}
