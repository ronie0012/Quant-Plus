"""Point-in-time extras for live forecasts: headlines, disclosure events and delivery flows.

The evidence cutoff is the close of the card's last completed bar. Anything first seen
later is excluded, so the forecast is genuinely "as of" that close. Every source is
optional: a dead feed leaves its slice empty and its forecaster abstains.
"""
from __future__ import annotations

import asyncio
import hashlib
from datetime import date, datetime, timedelta, timezone

from .events import Event, classify, in_window


def cutoff(as_of: str) -> datetime:
    from ..exchange_calendar import session_close
    return session_close(datetime.fromisoformat(as_of).date()).astimezone(timezone.utc)


def _when(value) -> datetime | None:
    if not value:
        return None
    try:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return (moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def headlines_and_announcements(articles: list[dict], symbol: str, until: datetime,
                                lookback_days: int = 30) -> tuple[list[str], list[Event]]:
    """Relevant headlines and classified official announcements published before the cutoff."""
    heads, events = [], []
    start = until - timedelta(days=lookback_days)
    for a in articles:
        published = _when(a.get("published_at"))
        if published is None or not start <= published <= until:
            continue
        if a.get("provider") == "nse_announcements":
            kind = classify(a.get("title", ""))
            if kind:
                eid = hashlib.sha256(f"{symbol}|{a.get('title')}|{published.isoformat()}".encode()).hexdigest()[:16]
                events.append(Event(eid, symbol, kind, published.isoformat(), {}))
        elif a.get("influences_sentiment") and published >= until - timedelta(days=3):
            heads.append(a["title"])
    return heads[:8], events


def results_events(raw: list, symbol: str, until: datetime, horizon_days: int) -> tuple[list[Event], bool]:
    """Earnings surprises already reported (as events) and whether results fall inside the horizon."""
    out, scheduled = [], False
    for e in raw:
        day = e.date if isinstance(e.date, date) else date.fromisoformat(str(e.date)[:10])
        when = datetime.combine(day, datetime.min.time(), timezone.utc)
        if e.kind == "earnings_reported" and when <= until and e.surprise_pct is not None:
            out.append(Event(f"eps-{symbol}-{day}", symbol, "earnings_surprise", when.isoformat(),
                             {"surprise_pct": float(e.surprise_pct)}))
        elif e.kind == "earnings_upcoming" and until < when <= until + timedelta(days=horizon_days):
            scheduled = True
    return out, scheduled


def delivery_flows(symbol: str, until: datetime) -> dict:
    from app.data.local_store import DeliveryStore
    row = DeliveryStore().latest(f"{symbol}.NS", until)
    if not row:
        return {}
    flows = {"delivery_pct": row["delivery_pct"], "delivery_pct_ma5": row["ma5"]}
    if row["z20"] is not None:
        flows["delivery_z20"] = row["z20"]
    return flows


def gather(symbol: str, as_of: str, horizon: int, articles: list[dict] | None = None) -> dict:
    """All optional extras for one live card. Pass `articles` when called inside a running event loop."""
    until = cutoff(as_of)
    extras = {"headlines": [], "events": [], "flows": {}, "scheduled_event": False, "sources": {}}
    events: list[Event] = []
    try:
        if articles is None:
            from ..news.service import news_service
            articles = asyncio.run(news_service.stock_news(symbol)).get("articles", [])
        heads, announced = headlines_and_announcements(articles, symbol, until)
        extras["headlines"], events = heads, announced
        extras["sources"]["news"] = "available"
    except Exception as error:  # noqa: BLE001
        extras["sources"]["news"] = f"unavailable: {type(error).__name__}"
    try:
        from app.data.events import YFinanceEventsProvider
        reported, scheduled = results_events(YFinanceEventsProvider().events(f"{symbol}.NS", until),
                                             symbol, until, horizon_days=int(horizon * 1.6) + 2)
        events += reported
        extras["scheduled_event"] = scheduled
        extras["sources"]["results"] = "available"
    except Exception as error:  # noqa: BLE001
        extras["sources"]["results"] = f"unavailable: {type(error).__name__}"
    try:
        extras["flows"] = delivery_flows(symbol, until)
        extras["sources"]["delivery"] = "available" if extras["flows"] else "no row before cutoff"
    except Exception as error:  # noqa: BLE001
        extras["sources"]["delivery"] = f"unavailable: {type(error).__name__}"
    extras["events"] = in_window(events, symbol, until.isoformat())
    return extras
