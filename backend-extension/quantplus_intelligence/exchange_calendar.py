"""Verified NSE capital-market session calendar for outcome maturation.

Years without an official circular are *unverified*: callers receive no
session days for them, so horizons that depend on the calendar abstain.
"""
from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from pathlib import Path

IST = timezone(timedelta(hours=5, minutes=30))
REGULAR_OPEN = time(9, 15)
REGULAR_CLOSE = time(15, 30)


@lru_cache(maxsize=1)
def calendar() -> dict:
    return json.loads((Path(__file__).with_name("nse_calendar.json")).read_text(encoding="utf-8"))


def year_verified(year: int) -> bool:
    return str(year) in calendar()["years"]


def is_trading_day(day: date) -> bool | None:
    """True/False for verified years; None when the year is unverified."""
    year = calendar()["years"].get(str(day.year))
    if year is None:
        return None
    if any(s["date"] == day.isoformat() for s in year.get("special_sessions", [])):
        # Special sessions (e.g. Muhurat) are not regular full sessions.
        return False
    return day.weekday() < 5 and day.isoformat() not in year["holidays"]


def session_days(start: date, end: date) -> list[str]:
    """Verified regular trading days in [start, end]; unverified years contribute none."""
    days, current = [], start
    while current <= end:
        if is_trading_day(current):
            days.append(current.isoformat())
        current += timedelta(days=1)
    return days


def session_close(day: date) -> datetime:
    return datetime.combine(day, REGULAR_CLOSE, IST)
