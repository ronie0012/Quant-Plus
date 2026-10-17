"""FastAPI entrypoint. Frontend touches ONLY /api/v1 (REST) + WS; never DB/gateway directly."""
from __future__ import annotations
import asyncio
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import router
from app.api.research import router as research_router
from app.config import settings

@asynccontextmanager
async def lifespan(app):
    import logging
    from app.api.fyers import CallbackLogFilter
    logging.getLogger("uvicorn.access").addFilter(CallbackLogFilter())
    from app.api.stocks import warm_predictions
    from contextlib import suppress
    warmer = asyncio.create_task(warm_predictions()) if settings.STOCK_PREDICTION_WARM_ENABLED else None
    sentiment_task = None
    sentiment_stop = asyncio.Event()
    if getattr(settings, "INTELLIGENCE_SCHEDULER_ENABLED", True):
        try:
            from quantplus_intelligence.market import market_engine
            from quantplus_intelligence.scheduler import SentimentSnapshotScheduler
            sentiment_task = asyncio.create_task(
                SentimentSnapshotScheduler(market_engine).run_forever(sentiment_stop)
            )
        except Exception:
            sentiment_task = None
    try:
        yield
    finally:
        if warmer:
            warmer.cancel()
            with suppress(asyncio.CancelledError):
                await warmer
        sentiment_stop.set()
        if sentiment_task:
            sentiment_task.cancel()
            with suppress(asyncio.CancelledError):
                await sentiment_task
        from app.data.live_market import market
        from app.data.fyers_provider import fyers
        await market.close()
        await fyers.close()

app = FastAPI(title="QuantPlus Agentic OS", version="1.0.0", lifespan=lifespan)
# CORS: browser frontend is a separate origin. Configured via FRONTEND_ORIGINS;
# the regex additionally permits any localhost port so dev servers just work.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins(),
    allow_origin_regex=r"http://localhost(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
from quantplus_intelligence.internal_auth import InternalAuthMiddleware
app.add_middleware(InternalAuthMiddleware)
app.include_router(router)
app.include_router(research_router)
from app.api.stocks import router as stocks_router
from app.api.market import router as market_router
from app.api.fyers import router as fyers_router
app.include_router(stocks_router)
app.include_router(market_router)
app.include_router(fyers_router)
from app.api.fyers import callback as fyers_callback
# The operator's registered redirect URL predates the /api/v1 adapter.
app.add_api_route("/fyers/callback", fyers_callback, methods=["GET"], response_class=HTMLResponse)

@app.websocket("/api/v1/sessions/{sid}/events")
async def session_events(ws: WebSocket, sid: str):
    """Live agent-reasoning stream: replays stored stage events, then polls until
    the session reaches a terminal state. Typed frames only — never raw LLM tokens."""
    from app.agents import graph as G
    from app.db import sqlite_conn
    await ws.accept()
    if not sqlite_conn().execute("SELECT 1 FROM sessions WHERE id=?", (sid,)).fetchone():
        await ws.send_text(json.dumps({"stage": "session", "agent": "orchestrator",
                                       "status": "error", "output_ref": "session not found"}))
        await ws.close()
        return
    sent = 0
    for _ in range(1200):  # ~10 min cap: one bounded loop, always exits
        for e in G.session_events(sid)[sent:]:
            await ws.send_text(json.dumps({"stage": e["stage"], "agent": e["agent"],
                                           "status": e["status"], "output_ref": e["ref"]}))
            sent += 1
        row = sqlite_conn().execute("SELECT status FROM sessions WHERE id=?", (sid,)).fetchone()
        status = row[0] if row else "failed: gone"
        if status == "done" or status.startswith("failed"):
            await ws.send_text(json.dumps({"stage": "session", "agent": "orchestrator",
                                           "status": status, "output_ref": sid}))
            break
        await asyncio.sleep(0.5)
    await ws.close()

@app.websocket("/api/v1/arena/events")
async def arena_events(ws: WebSocket):
    """Population transitions (births/deaths/resurrections/weakens) as typed frames.

    Replays the append-only evo_events log, then polls for new rows. Read-only.
    Exits on client disconnect (or the ~10-min cap).
    """
    from app.evo import store
    await ws.accept()
    last_seq = 0
    for _ in range(1200):  # ~10 min cap; also breaks early on disconnect
        for e in store.events(last_seq):
            await ws.send_text(json.dumps(e))
            last_seq = e["seq"]
        try:
            await asyncio.wait_for(ws.receive_text(), timeout=0.5)
        except asyncio.TimeoutError:
            continue
        except WebSocketDisconnect:
            break
    await ws.close()

# QuantPlus intelligence extension (additive, numerical scores owned by code)
from quantplus_intelligence.api import router as intelligence_router
app.include_router(intelligence_router, prefix="/api/v1")
app.include_router(intelligence_router, prefix="/api", include_in_schema=False)
