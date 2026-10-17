"""Events/Catalyst Analyst: earnings surprises, scheduled results, corporate actions.

Fifth parallel analyst. Works with whatever the free diet provides; an empty window
is an honest abstention (low confidence, neutral) — the Manager must not let it veto.
"""
from __future__ import annotations
from datetime import datetime
from app import schemas as S
from app.agents._util import call_json
from app.agents.analysts import _REPORT_SHAPE
from app.data.events import YFinanceEventsProvider, events_brief

def run_events(instrument: str, as_of: datetime, session_id: str) -> S.AnalystReport:
    from app.log import log as qlog
    try:
        items = YFinanceEventsProvider().events(instrument, as_of)
        feed_note = ""
    except Exception as e:
        # A dead events feed must abstain loudly, never kill the session or fake data.
        items = []
        feed_note = (f"\n(events feed unavailable: {type(e).__name__} — abstaining. "
                     f"Do not infer or invent any events.)")
        qlog(session_id, "analyst", "events", "feed_unavailable", error=str(e)[:200])
    reported = [e for e in items if e.kind == "earnings_reported"]
    upcoming = [e for e in items if e.kind == "earnings_upcoming"]
    hint = ""
    if reported:
        last = reported[-1]
        hint = f"\nlatest surprise: {last.surprise_pct:+.1f}% on {last.date}" if last.surprise_pct is not None else ""
    if upcoming:
        hint += f"\ncaution: results due {upcoming[0].date} — technicals may not survive the event"
    system = ("You are the Events/Catalyst Analyst. Use ONLY the corporate events given. "
              "Post-earnings drift is real: a large positive surprise supports continuation, "
              "a large miss supports weakness; imminent scheduled results are a risk flag, not "
              "a direction. Empty window -> say so, confidence <= 0.3, neutral signals. "
              "Return ONLY AnalystReport JSON: {summary, signals[], confidence, evidence[]}. "
              + _REPORT_SHAPE)
    user = (f"instrument={instrument} as_of={as_of.isoformat()}\nevents:\n"
            f"{events_brief(items)}{hint}{feed_note}\navailable_at={as_of.isoformat()}")
    return call_json("events", session_id, system, user, S.AnalystReport, {"agent": "events"}, grounding=user, as_of=as_of)
