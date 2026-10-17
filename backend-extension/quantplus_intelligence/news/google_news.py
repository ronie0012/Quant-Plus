"""RSS discovery only. Never follow article links or scrape publishers."""
from __future__ import annotations

import asyncio
import hashlib
import html
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import timezone
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from ..common import log, utcnow
from ..config import config
from .provider import ProviderResult


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def clean(value, limit=1500):
    parser = PlainText()
    parser.feed(html.unescape(value or ""))
    return re.sub(r"\s+", " ", " ".join(parser.parts)).strip()[:limit]


class GoogleNewsProvider:
    name = "google_news"

    def __init__(self, transport=None):
        self.transport = transport
        self.slots = asyncio.Semaphore(3)

    async def search(self, query, limit=20):
        async with self.slots:
            for attempt in range(2):
                try:
                    async with httpx.AsyncClient(
                        timeout=config.provider_timeout_seconds, transport=self.transport,
                        headers={"User-Agent": "QuantPlus-NewsIntelligence/1.0 (RSS reader)"},
                        follow_redirects=False,
                    ) as client:
                        async with client.stream("GET", "https://news.google.com/rss/search", params={
                            "q": f"{query} when:1d", "hl": "en-IN", "gl": "IN", "ceid": "IN:en",
                        }) as response:
                            response.raise_for_status()
                            chunks, size = [], 0
                            async for chunk in response.aiter_bytes():
                                size += len(chunk)
                                if size > 2_000_000:
                                    raise ValueError("RSS size limit exceeded")
                                chunks.append(chunk)
                            raw = b"".join(chunks)
                    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
                        raise ValueError("Unsafe XML")
                    root = ET.fromstring(raw)
                    if root.tag != "rss" or root.find("channel") is None:
                        raise ValueError("Not an RSS feed")
                    articles = []
                    now = utcnow()
                    for item in root.findall("./channel/item"):
                        title = clean(item.findtext("title"), 500)
                        url = (item.findtext("link") or "").strip()
                        try:
                            published = parsedate_to_datetime(item.findtext("pubDate") or "")
                            published = published.replace(tzinfo=timezone.utc) if not published.tzinfo else published
                            published = published.astimezone(timezone.utc)
                            age = (now - published).total_seconds() / 3600
                            parsed = urlparse(url)
                            if not title or age < 0 or age > config.max_article_age_hours:
                                continue
                            if parsed.scheme != "https" or parsed.hostname != "news.google.com":
                                continue
                        except (ValueError, TypeError, OverflowError):
                            continue
                        source = clean(item.findtext("source"), 120) or "Unknown"
                        title = title.removesuffix(" - " + source)
                        article_id = hashlib.sha256(f"{self.name}|{url}".encode()).hexdigest()
                        snippet = clean(item.findtext("description"))
                        # Google descriptions frequently repeat the headline plus publisher.
                        snippet = snippet.removesuffix(source).strip()
                        if snippet == title:
                            snippet = ""
                        articles.append({"id": article_id, "title": title, "source": source,
                                         "published_at": published.isoformat(), "url": url,
                                         "snippet": snippet, "provider": self.name})
                        if len(articles) >= min(limit, config.max_news_items):
                            break
                    log("news_provider_fetched", provider=self.name, articles=len(articles))
                    return ProviderResult(articles, provider=self.name)
                except (httpx.HTTPError, ValueError, ET.ParseError) as error:
                    retry = isinstance(error, httpx.TransportError) or (
                        isinstance(error, httpx.HTTPStatusError) and error.response.status_code >= 500)
                    if retry and attempt == 0:
                        await asyncio.sleep(.3)
                        continue
                    log("news_provider_failure", provider=self.name, error_type=type(error).__name__)
                    return ProviderResult(status="unavailable", provider=self.name, reason="RSS provider unavailable")
        return ProviderResult(status="unavailable", provider=self.name)
