"""v1 API contract (Build Plan Sec 8). Implemented now: sessions/theses/eval/health. WS streams stage events."""
from __future__ import annotations
import hashlib
import json
from datetime import timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException
from app import schemas as S
from app.agents import graph as G
from app.config import settings
from app.db import sqlite_conn, pg_ok, mongo_ok
from app import audit, control

router = APIRouter(prefix="/api/v1")

def _cfg_hash() -> str:
    return hashlib.sha256(
        f"{settings.ANALYST_MODEL}|{settings.DECIDER_MODEL}|{settings.PROMPT_VERSION}|"
        f"{settings.DIRECTION_POLICY}|grounding-v2".encode()).hexdigest()[:12]

def _portfolio_fp(portfolio: dict | None) -> str:
    if not portfolio:
        return ""
    try:
        from app.portfolio import PortfolioContext
        return PortfolioContext.model_validate(portfolio).fingerprint()
    except Exception:
        # Fail-fast on bad portfolio shape (never silently ignore holdings).
        raise HTTPException(422, "portfolio shape invalid: expected {cash?, currency?, positions[]}")

@router.post("/sessions", response_model=S.SessionStatus)
def create_session(req: S.SessionRequest, bg: BackgroundTasks):
    # Operator kill switch: halt new work loudly; stored sessions stay readable.
    if control.is_engaged():
        raise HTTPException(503, "kill switch engaged: new sessions halted")
    as_of = req.as_of if req.as_of.tzinfo else req.as_of.replace(tzinfo=timezone.utc)
    cfg = _cfg_hash()
    pfp = _portfolio_fp(req.portfolio)
    # manager_mode is part of the sid namespace (Day 4 sandbox): retry sessions
    # never collide with frozen-pipeline sessions.
    mode_suffix = f"|{req.manager_mode}" if req.manager_mode != "frozen" else ""
    sid = G.new_session_id(req.instrument, as_of.isoformat(), cfg + mode_suffix, pfp)
    conn = sqlite_conn()
    row = conn.execute("SELECT status, decision FROM sessions WHERE id=?", (sid,)).fetchone()
    if row and row[0] == "done" and row[1] and not req.force_rerun:
        return S.SessionStatus(id=sid, status=row[0], decision=S.FinalDecision(**json.loads(row[1])))
    if req.force_rerun:
        G.clear_checkpoints(sid)  # force = fresh run, re-bill everything deliberately
    # failed/running/queued without a decision -> (re)queue; run_session resumes
    # from checkpoints so completed stages are never re-billed.
    conn.execute("INSERT OR REPLACE INTO sessions(id, instrument, as_of, config_hash, status, decision) VALUES (?,?,?,?,?,?)",
                 (sid, req.instrument, as_of.isoformat(), cfg, "queued", None))
    conn.commit()
    bg.add_task(_run_session, sid, req.instrument, as_of.isoformat(), req.interval,
                req.portfolio, req.manager_mode)
    return S.SessionStatus(id=sid, status="queued", decision=None)

def _run_session(sid: str, instrument: str, as_of_iso: str, interval: str,
                 portfolio: dict | None = None, manager_mode: str = "frozen"):
    """Background worker: executes the real agent graph (Phases 4-6)."""
    from datetime import datetime
    as_of = datetime.fromisoformat(as_of_iso)
    # manager_mode=retry routes to the sandboxed retry prompt pack (Day 4);
    # frozen (default) keeps the audited pipeline untouched.
    if manager_mode == "retry":
        from app.agents import retry_manager as _R
        _R.run_session_retry(sid, instrument, as_of, interval, portfolio)
    else:
        G.run_session(sid, instrument, as_of, interval, portfolio=portfolio)

@router.get("/sessions/{sid}", response_model=S.SessionStatus)
def get_session(sid: str):
    row = sqlite_conn().execute("SELECT status, decision FROM sessions WHERE id=?", (sid,)).fetchone()
    if not row:
        raise HTTPException(404, "session not found")
    return S.SessionStatus(id=sid, status=row[0],
                           decision=S.FinalDecision(**json.loads(row[1])) if row[1] else None)

@router.get("/theses/{instrument}")
def get_theses(instrument: str):
    return {"instrument": instrument, "history": G.thesis_history(instrument)}

@router.get("/theses/{instrument}/diff/{v1}/{v2}")
def diff_theses(instrument: str, v1: int, v2: int):
    hist = {h["version"]: h for h in G.thesis_history(instrument)}
    if v1 not in hist or v2 not in hist:
        raise HTTPException(404, "thesis version not found")
    return {"instrument": instrument, "v1": hist[v1], "v2": hist[v2],
            "status_changed": hist[v1]["status"] != hist[v2]["status"]}

@router.post("/eval/run")
def eval_run():
    # Phase 8 builds the 24-scenario harness; stub keeps contract testable.
    return {"status": "not_implemented", "message": "eval harness lands in Phase 8"}

# --- Day 6: arena, kill switch, audit (additive routes; frontend surface) ---

@router.get("/arena", response_model=S.ArenaState)
def get_arena():
    from app.evo import arena
    return arena.population_state()

@router.post("/arena/founders")
def bootstrap_founders():
    """Birth the 8 preregistered founders once (idempotent; frontend clock start)."""
    from app.evo import arena
    if control.is_engaged():
        raise HTTPException(503, "kill switch engaged: cannot admit variants")
    return arena.bootstrap_founders()

@router.get("/arena/events")
def arena_events(since: int = 0):
    from app.evo import arena
    return {"events": arena.events_since(since)}

@router.get("/killswitch", response_model=S.KillSwitchState)
def killswitch_status():
    return control.status()

@router.post("/killswitch", response_model=S.KillSwitchState)
def killswitch_set(req: S.ControlRequest):
    return control.engage(req.reason) if req.engage else control.release()

@router.get("/audit/export")
def audit_export(limit: int = 1000):
    return audit.export(limit=limit)

@router.get("/health")
def health():
    from app.gateway.codecraft import gateway
    llm = len(gateway.clients) > 0
    return {"db": True, "sqlite": True, "pg_configured": pg_ok(settings.DATABASE_URL),
            "mongo_configured": mongo_ok(settings.MONGO_URL),
            "llm_gateway": llm, "analyst_model": settings.ANALYST_MODEL,
            "decider_model": settings.DECIDER_MODEL}
