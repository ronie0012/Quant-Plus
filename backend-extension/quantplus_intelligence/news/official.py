"""Best-effort official NSE announcement discovery for the news engine.

Only announcement metadata is consumed. No attachment or article page is fetched.
The provider is deliberately additive: RSS remains the broad market-news source.

Time semantics: NSE announcement times are exchange wall-clock times without an
offset, so they are interpreted as Asia/Kolkata. Any other format is quarantined
rather than guessed, and timestamps in the future are quarantined, not clamped.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import httpx

from ..common import utcnow
from ..config import config
from .provider import ProviderResult

IST = timezone(timedelta(hours=5, minutes=30))
MAX_FUTURE_SKEW = timedelta(minutes=5)
NSE_FORMATS = ("%d-%b-%Y %H:%M:%S", "%d-%b-%Y %H:%M", "%Y-%m-%d %H:%M:%S")


def parse_nse_time(value: str) -> datetime | None:
    """Parse an NSE timestamp; offset-less values are IST wall times. None when ambiguous."""
    value = value.strip()
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        parsed = None
        for pattern in NSE_FORMATS:
            try:
                parsed = datetime.strptime(value, pattern)
                break
            except ValueError:
                continue
        if parsed is None:
            return None
    return parsed.replace(tzinfo=IST) if parsed.tzinfo is None else parsed


def normalize_rows(symbol: str, rows: list, limit: int, now: datetime | None = None):
    now = now or utcnow()
    articles, quarantined = [], []
    for row in rows[: max(1, limit)]:
        title = str(row.get("headline") or row.get("title") or row.get("desc") or "").strip()
        raw_time = str(row.get("an_dt") or row.get("date") or row.get("broadcastDate") or "").strip()
        if not title:
            continue
        parsed = parse_nse_time(raw_time)
        if parsed is None:
            quarantined.append({"title": title[:200], "raw_time": raw_time, "reason": "AMBIGUOUS_TIMESTAMP"})
            continue
        published = parsed.astimezone(timezone.utc)
        if published > now + MAX_FUTURE_SKEW:
            quarantined.append({"title": title[:200], "raw_time": raw_time, "reason": "FUTURE_TIMESTAMP"})
            continue
        if (now - published).total_seconds() / 3600 > config.max_article_age_hours:
            continue
        broadcast = parse_nse_time(str(row.get("exchdisstime") or ""))
        attachment = str(row.get("attchmntFile") or "").strip()
        article_id = hashlib.sha256(f"nse-announcement|{symbol}|{raw_time}|{title}".encode()).hexdigest()
        articles.append({
            "id": article_id,
            "title": title[:500],
            "source": "NSE official announcement",
            "published_at": published.isoformat(),
            "source_time": raw_time,
            "source_time_zone": "Asia/Kolkata (NSE wall time)" if parsed.tzinfo == IST else "explicit offset",
            "broadcast_at": broadcast.astimezone(timezone.utc).isoformat() if broadcast else None,
            "first_seen_at": now.isoformat(),
            # Point-in-time availability is when this system observed the item.
            "available_at": max(published, now).isoformat(),
            "url": "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
            "attachment_url": attachment if attachment.startswith("https://") else None,
            "snippet": str(row.get("attchmntText") or row.get("desc") or "")[:1500],
            "provider": "nse_announcements",
            "language": "en",
        })
    return articles, quarantined


async def search(symbol: str, limit: int = 10) -> ProviderResult:
    url = "https://www.nseindia.com/api/corporate-announcements"
    try:
        async with httpx.AsyncClient(
            timeout=config.provider_timeout_seconds,
            headers={
                "User-Agent": "QuantPlus-NewsIntelligence/1.0 (official announcement reader)",
                "Accept": "application/json",
            },
            follow_redirects=False,
        ) as client:
            response = await client.get(url, params={"index": "equities", "symbol": symbol})
        response.raise_for_status()
        payload = response.json()
        rows = payload if isinstance(payload, list) else payload.get("rows", [])
        articles, quarantined = normalize_rows(symbol, rows, limit)
        return ProviderResult(articles=articles, provider="nse_announcements", quarantined=quarantined)
    except (httpx.HTTPError, ValueError, TypeError):
        return ProviderResult(status="unavailable", provider="nse_announcements", reason="Official announcements unavailable")
