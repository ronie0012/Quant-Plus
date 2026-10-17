"""Agent graph: analysts (parallel, luna) -> debate -> manager/sonnet -> devil/sonnet -> trader -> risk -> PM/sonnet.

Phase 3-6 implements real prompts; this module holds the state machine + deterministic versioning.
Step 8 versioning is deterministic code, never LLM-owned.
"""
from __future__ import annotations
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from app import schemas as S
from app.db import sqlite_conn

def new_session_id(instrument: str, as_of: str, config_hash: str, portfolio_fp: str = "") -> str:
    import hashlib
    base = f"{instrument}|{as_of}|{config_hash}"
    if portfolio_fp:
        base += f"|{portfolio_fp}"
    return hashlib.sha256(base.encode()).hexdigest()[:16]

def record_thesis(instrument: str, status: str, body: str, session_id: str = "") -> int:
    """Deterministic HEALTHY->BROKEN versioning. Returns new version number.

    Idempotent per session: a crash between record + checkpoint must not mint
    duplicate versions on resume, so an existing version tagged with this
    session_id is reused instead of inserted.
    """
    conn = sqlite_conn()
    if session_id:
        row = conn.execute(
            "SELECT version FROM theses WHERE instrument=? AND body LIKE ? ORDER BY version DESC LIMIT 1",
            (instrument, f'%"session_id": "{session_id}"%')).fetchone()
        if row:
            return row[0]
    cur = conn.execute("SELECT MAX(version) FROM theses WHERE instrument=?", (instrument,))
    ver = (cur.fetchone()[0] or 0) + 1
    conn.execute("INSERT INTO theses(instrument, version, status, body, created_at) VALUES (?,?,?,?,?)",
                 (instrument, ver, status, body, datetime.now(timezone.utc).isoformat()))
    conn.commit()
    return ver

def thesis_history(instrument: str) -> list[dict]:
    conn = sqlite_conn()
    rows = conn.execute("SELECT version, status, body, created_at FROM theses WHERE instrument=? ORDER BY version",
                        (instrument,)).fetchall()
    return [{"version": r[0], "status": r[1], "body": r[2], "created_at": r[3]} for r in rows]

def log_event(session_id: str, stage: str, agent: str, status: str, ref: str = ""):
    sqlite_conn().execute(
        "INSERT INTO session_events(session_id, ts, stage, agent, status, ref) VALUES (?,?,?,?,?,?)",
        (session_id, datetime.now(timezone.utc).isoformat(), stage, agent, status, ref))
    sqlite_conn().commit()

def session_events(session_id: str) -> list[dict]:
    rows = sqlite_conn().execute(
        "SELECT ts, stage, agent, status, ref FROM session_events WHERE session_id=? ORDER BY rowid",
        (session_id,)).fetchall()
    return [{"ts": r[0], "stage": r[1], "agent": r[2], "status": r[3], "ref": r[4]} for r in rows]

def _save_ckpt(session_id: str, stage: str, payload: str):
    sqlite_conn().execute(
        "INSERT OR REPLACE INTO checkpoints(session_id, stage, payload, updated_at) VALUES (?,?,?,?)",
        (session_id, stage, payload, datetime.now(timezone.utc).isoformat()))
    sqlite_conn().commit()

def _load_ckpt(session_id: str, stage: str) -> str | None:
    row = sqlite_conn().execute(
        "SELECT payload FROM checkpoints WHERE session_id=? AND stage=?", (session_id, stage)).fetchone()
    return row[0] if row else None

def clear_checkpoints(session_id: str):
    sqlite_conn().execute("DELETE FROM checkpoints WHERE session_id=?", (session_id,))
    sqlite_conn().commit()

class _Deadline:
    def __init__(self, seconds: int):
        import time
        self.end = time.monotonic() + seconds
    def check(self, stage: str):
        import time
        if time.monotonic() > self.end:
            raise TimeoutError(f"session wall-clock budget exceeded before stage '{stage}'")

def _devil_or_default(thesis, rep_list, session_id: str, exhaustion, devil_mode: str):
    """Ablation hook (Day 5): off-mode returns a default HEALTHY challenge with
    an audit tag instead of billing the Devil. On-mode delegates untouched."""
    if devil_mode == "off":
        return S.Challenge(
            status=S.ThesisStatus.HEALTHY,
            core_claim_restated="[ABLATION devil-off] " + thesis.key_evidence[0]
            if thesis.key_evidence else "[ABLATION devil-off] no evidence listed",
            new_evidence_considered=[],
            duplicate_risks_discarded=[],
            direction_symmetry_check_passed=True,
            raw_override_applied=False,
            reasons=["devil bypassed by ablation harness (no falsification attempted)"],
        )
    from app.agents import manager as M
    return M.run_devils_advocate(thesis, rep_list, session_id, exhaustion)


def run_session(session_id: str, instrument: str, as_of: datetime, interval: str = "1d",
                deadline_s: int = 1800, portfolio: dict | None = None,
                devil_mode: str = "on") -> S.FinalDecision:
    """Full graph with crash-resume: analysts(parallel) -> debate -> manager -> devil ->
    version -> trader -> risk -> PM. Completed stages are checkpointed; resume never
    re-bills LLM calls for stages already done. All loops bounded (debate rounds cap,
    single-pass risk panel); wall-clock deadline aborts runaway sessions.

    Day 2 (NEW_PLAN T2.1): optional broker-neutral `portfolio` dict
    ({cash, currency, positions[]} ) is rendered into Trader/Risk/PM prompts.
    None => legacy flat-unknown behavior, sid unchanged.

    Day 5 (NEWW_PLAN ablation harness): devil_mode="off" substitutes a default
    HEALTHY challenge (audited tag) instead of billing the Devil call. Default
    "on" is byte-identical legacy behavior. Off-mode sessions must use distinct
    sids (caller responsibility — see scripts/ablate_devil.py).
    """
    if devil_mode not in ("on", "off"):
        raise ValueError("devil_mode must be 'on' or 'off'")
    import concurrent.futures
    from app.agents import analysts as A, debate as D, manager as M, trader_risk as T
    from app.agents.technical import run as run_tech
    from app.agents.events_analyst import run_events
    from app.data.regime import regime_at, market_trend_at
    from app.log import log as qlog

    dl = _Deadline(deadline_s)
    conn = sqlite_conn()
    conn.execute("UPDATE sessions SET status=? WHERE id=?", ("running", session_id))
    conn.commit()
    log_event(session_id, "session", "orchestrator", "running")
    qlog(session_id, "session", "orchestrator", "start", instrument=instrument,
         as_of=as_of.isoformat(), interval=interval)

    def cached(stage: str, loads, fn, evt: tuple[str, str, str]):
        hit = _load_ckpt(session_id, stage)
        if hit is not None:
            qlog(session_id, evt[0], evt[1], "resumed_from_checkpoint")
            return loads(hit)
        dl.check(stage)
        log_event(session_id, evt[0], evt[1], "running")
        out = fn()
        _save_ckpt(session_id, stage, out if isinstance(out, str) else _dump(out))
        log_event(session_id, *evt)
        qlog(session_id, evt[0], evt[1], evt[2])
        return out

    try:
        def _analysts():
            runners = {
                "technical": lambda: run_tech(instrument, as_of, interval, session_id),
                "fundamentals": lambda: A.run_fundamentals(instrument, as_of, interval, session_id),
                "news": lambda: A.run_news(instrument, as_of, session_id),
                "macro": lambda: A.run_macro(instrument, as_of, interval, session_id),
                "events": lambda: run_events(instrument, as_of, session_id),
            }
            results = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
                futures = {}
                for name, runner in runners.items():
                    hit = _load_ckpt(session_id, f"analyst:{name}")
                    if hit:
                        results[name] = S.AnalystReport.model_validate_json(hit)
                    else:
                        futures[ex.submit(runner)] = name
                failure = None
                for future in concurrent.futures.as_completed(futures):
                    name = futures[future]
                    try:
                        report = future.result()
                        results[name] = report
                        _save_ckpt(session_id, f"analyst:{name}", report.model_dump_json())
                        log_event(session_id, "analyst", name, "done")
                        from app.agents import claims
                        claim_audit = claims.take(session_id, name)
                        if claim_audit is not None:
                            log_event(session_id, "claim_validation", name, claim_audit["status"],
                                      json.dumps(claim_audit, sort_keys=True)[:1000])
                    except Exception as error:
                        failure = failure or error
                if failure:
                    raise failure
                return {name: results[name] for name in runners}

        reports: dict = cached("analysts",
            lambda p: {k: S.AnalystReport(**v) for k, v in json.loads(p).items()},
            _analysts, ("analyst", "team", "done"))
        rep_list = [reports[k] for k in ("technical", "fundamentals", "news", "macro", "events")]

        turns: list = cached("debate",
            lambda p: [S.DebateTurn(**v) for v in json.loads(p)],
            lambda: D.run_debate(rep_list, session_id), ("debate", "bull_bear", "done"))

        thesis: S.Thesis = cached("thesis", S.Thesis.model_validate_json,
            lambda: M.run_manager(rep_list, turns, session_id), ("thesis", "research_manager", "done"))

        def _exhaustion() -> S.RawExhaustionSignals | None:
            # Pass-through (Part A): the exact dict Technical computed, via checkpoint.
            # Absent for pre-v5.1 sessions — Devil treats that as unavailable, never as evidence.
            hit = _load_ckpt(session_id, "exhaustion")
            if hit is None:
                return None
            d = json.loads(hit)
            return S.RawExhaustionSignals(
                flush_flag=bool(d["flush_flag"]), blowoff_flag=bool(d["blowoff_flag"]),
                ret_5d_pct=float(d["ret_5d_pct"]),
                dist_from_20d_low_pct=float(d["dist_from_20d_low_pct"]),
                dist_from_20d_high_pct=float(d["dist_from_20d_high_pct"]))

        challenge: S.Challenge = cached("challenge", S.Challenge.model_validate_json,
            lambda: _devil_or_default(thesis, rep_list, session_id, _exhaustion(), devil_mode),
            ("challenge", "devils_advocate", "done"))

        def _version():
            body = json.dumps({"session_id": session_id, "thesis": thesis.model_dump(mode="json"),
                               "challenge": challenge.model_dump(mode="json")})
            return record_thesis(instrument, challenge.status.value, body, session_id)

        version: int = cached("version", int,
            _version, ("thesis", "version_engine", "done"))

        # Day 2 (NEW_PLAN T2.1): portfolio block for Trader/Risk/PM.
        # Validated here (fail-fast on bad shape), rendered ticker-led.
        portfolio_block = ""
        if portfolio:
            from app.portfolio import PortfolioContext
            pc = PortfolioContext.model_validate(portfolio)
            portfolio_block = pc.render(instrument)

        proposal: S.TradeProposal = cached("proposal", S.TradeProposal.model_validate_json,
            lambda: T.run_trader(instrument, thesis, challenge, as_of, session_id,
                                 portfolio_block=portfolio_block),
            ("trade", "trader", "done"))

        verdicts: dict = cached("risk",
            lambda p: {k: S.RiskVerdict(**v) for k, v in json.loads(p).items()},
            lambda: T.run_risk_panel(proposal, thesis, challenge, session_id,
                                     portfolio_block=portfolio_block), ("risk", "panel", "done"))

        # M3: deterministic VIX regime for the code-level gate in run_pm.
        # regime_at() is total (CALM on missing/insufficient data) so this never
        # crashes a session; the value is logged for audit.
        regime = regime_at(as_of)
        market_trend = market_trend_at(as_of)
        from app.config import settings as _settings
        qlog(session_id, "trade", "regime_gate", "classified", regime=regime,
             market_trend=market_trend, mechanism=thesis.mechanism_type.value,
             direction_policy=_settings.DIRECTION_POLICY)
        decision = T.run_pm(instrument, thesis, challenge, proposal, verdicts, version,
                            session_id, regime=regime, market_trend=market_trend,
                            direction_policy=_settings.DIRECTION_POLICY,
                            portfolio_block=portfolio_block)
        _save_ckpt(session_id, "decision", decision.model_dump_json())
        conn.execute("UPDATE sessions SET status=?, decision=? WHERE id=?",
                     ("done", decision.model_dump_json(), session_id))
        conn.commit()
        log_event(session_id, "session", "portfolio_manager", "done", f"v{version}")
        qlog(session_id, "session", "portfolio_manager", "done",
             action=decision.action, size=decision.size, thesis_version=version)
        return decision
    except Exception as e:
        conn.execute("UPDATE sessions SET status=? WHERE id=?", (f"failed: {type(e).__name__}", session_id))
        conn.commit()
        log_event(session_id, "session", "orchestrator", f"failed: {e}")
        qlog(session_id, "session", "orchestrator", "failed", error=f"{type(e).__name__}: {e}")
        raise

def _dump(out) -> str:
    if isinstance(out, int):
        return str(out)
    if isinstance(out, dict):
        return json.dumps({k: (v.model_dump(mode="json") if hasattr(v, "model_dump") else v)
                           for k, v in out.items()})
    if isinstance(out, list):
        return json.dumps([v.model_dump(mode="json") for v in out])
    return out.model_dump_json()
