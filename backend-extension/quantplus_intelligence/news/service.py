from __future__ import annotations

import asyncio
import time
from dataclasses import asdict

from ..cache import cache
from ..common import log, utcnow
from ..config import config, MARKET_QUERIES
from ..market_data import market_data
from .provider import ProviderResult
from .google_news import GoogleNewsProvider
from .resolver import Company, resolve
from .deduplicator import deduplicate
from .relevance import language, relevance
from .sentiment import analyze
from .impact import impact
from .events import extract_event
from .aggregation import aggregate
from .market_taxonomy import classify
from . import official
from .archive import NewsArchive
from .registry import registry
from .attachments import AttachmentIngestor


class NewsService:
    def __init__(self, provider=None, cache_layer=None, data=None, archive=None):
        self.provider = provider or GoogleNewsProvider()
        self.cache = cache_layer or cache
        self.data = data or market_data
        self.archive = archive if archive is not None else (
            NewsArchive(config.news_archive_path) if config.news_archive_path else None)
        self.attachments = AttachmentIngestor(self.archive) if self.archive is not None else None
        registry.register(self.provider.name, "news_discovery", "configured provider", 30)

    async def _through_registry(self, name, call):
        refusal = registry.admit(name)
        if refusal:
            return ProviderResult(status="unavailable", provider=name, reason=f"Connector {refusal}")
        try:
            result = await call()
        except Exception as error:
            registry.failure(name, type(error).__name__)
            log("news_provider_failure", provider=name, error_type=type(error).__name__)
            return ProviderResult(status="unavailable", provider=name, reason="News provider unavailable")
        if result.status == "available":
            # An empty answer is a successful query with no news, not a provider failure.
            registry.success(name, empty=not result.articles)
        else:
            registry.failure(name, result.reason or "unavailable")
        return result

    async def safe_search(self, query):
        return await self._through_registry(
            self.provider.name, lambda: self.provider.search(query, config.max_news_items))

    async def stock_news(self, symbol):
        company = resolve(symbol)
        return await self.cache.get_or_load("stock-news:" + company.symbol, config.news_ttl_seconds,
            lambda: self._analyze(company, [company.query]))

    async def market_news(self):
        company = Company("MARKET", "Indian market", "Indian stock market")
        return await self.cache.get_or_load("market-news", config.news_ttl_seconds,
            lambda: self._analyze(company, MARKET_QUERIES))

    async def _analyze(self, company, queries):
        start = time.monotonic()
        feeds = await asyncio.gather(*(self.safe_search(q) for q in queries))
        if company.symbol != "MARKET" and isinstance(self.provider, GoogleNewsProvider):
            feeds.append(await self._through_registry(
                "nse_announcements",
                lambda: official.search(company.symbol, max(5, config.max_news_items // 2))))
        raw = [article for feed in feeds for article in feed.articles]
        archive_status = "disabled"
        if self.archive is not None:
            try:
                raw = await self.archive.record(raw)
                archive_status = "persisted"
            except Exception as error:
                archive_status = "unavailable"
                log("news_archive_failure", error_type=type(error).__name__)
        quarantined = [item for feed in feeds for item in feed.quarantined]
        unique = deduplicate(raw)
        if self.attachments is not None:
            # Bound per-refresh work; attachment text stays untrusted and does not
            # silently become a sentiment score or a validated financial fact.
            official_items = [item for item in unique if item.get("provider") == "nse_announcements" and item.get("attachment_url")][:3]
            parsed = await asyncio.gather(*(self.attachments.ingest(item) for item in official_items))
            results = {item["id"]: value for item, value in zip(official_items, parsed)}
            unique = [{**item, **({"attachment": results[item["id"]]} if item["id"] in results else {})} for item in unique]
        articles = []
        for article in unique:
            article = {**article, "symbol": company.symbol, "company": company.company}
            article["language"] = language(f"{article['title']} {article.get('snippet', '')}")
            article["relevance_score"] = relevance(article, company)
            article.update(analyze(article, company))
            article.update(impact(article))
            article["event"] = extract_event(article, company) if company.symbol != "MARKET" else None
            # The article score is headline tone from transparent rules; it is not an
            # economic-impact estimate, a forecast, or a probability.
            article["sentiment_kind"] = "headline_textual_tone_rules_v1"
            if company.symbol == "MARKET":
                market_category, duration, sectors = classify(article["title"])
                article.update({"market_category": market_category, "expected_duration": duration,
                                "affected_sectors": sectors})
            # Hindi/mixed-script text is not scored by the English rules; it is labelled instead.
            article["language_handling"] = "scored" if article["language"] == "en" else "unsupported_script_not_scored"
            article["influences_sentiment"] = (
                article["language"] == "en" and article["relevance_score"] >= config.relevance_threshold)
            articles.append(article)
        summary = aggregate(articles, company.symbol, market=company.symbol == "MARKET")
        available = sum(f.status == "available" for f in feeds)
        quality = "DEGRADED" if available == 0 else "PARTIAL"
        # Rules-based analysis remains PARTIAL: headlines do not establish full financial context.
        log("news_analysis", symbol=company.symbol, fetched=len(raw), duplicates_removed=len(raw)-len(unique),
            rejected_irrelevant=sum(not a["influences_sentiment"] for a in articles),
            duration_ms=round((time.monotonic()-start)*1000))
        category_counts = {}
        for item in articles:
            category = item.get("market_category") if company.symbol == "MARKET" else item.get("category", "other")
            category_counts[category] = category_counts.get(category, 0) + 1
        return {"symbol": company.symbol, "company": company.company, "articles": articles,
            "provider_status": {"provider": "+".join(dict.fromkeys(f.provider for f in feeds)),
                                "status": "available" if available == len(feeds) else
                                "partial" if available else "unavailable", "queries_succeeded": available,
                                "queries_total": len(feeds), "connectors": registry.status(),
                                "archived": archive_status == "persisted", "archive_status": archive_status, "quarantined": quarantined},
            "data_quality": quality, "confidence": summary["confidence"], "updated_at": utcnow().isoformat(),
            "relevance_threshold": config.relevance_threshold, "company_metadata": asdict(company),
            "category_counts": category_counts,
            "counts": {"fetched": len(raw), "deduplicated": len(unique), "relevant": sum(a["influences_sentiment"] for a in articles)}}

    async def stock_sentiment(self, symbol):
        news, snapshot = await asyncio.gather(self.stock_news(symbol), self.data.stock(resolve(symbol).symbol))
        quote = snapshot["quote"]
        articles = [{**a, **impact(a, quote)} for a in news["articles"]]
        result = aggregate(articles, news["symbol"], quote)
        result.update(provider_status=news["provider_status"], news_updated_at=news["updated_at"],
                      market_data_status=snapshot["data_quality"], price_as_of=quote.get("as_of") if quote else None)
        if news["data_quality"] == "DEGRADED":
            result["data_quality"] = "DEGRADED"
        if snapshot["market_session"] == "closed":
            result["price_confirmation"] = None
            result["news_price_divergence"] = False
            result["price_confirmation_status"] = "unavailable_market_closed"
        elif quote:
            # Price movement only confirms news published before this observation.
            dated = [a for a in articles if a["influences_sentiment"] and a["published_at"] <= quote["as_of"]]
            if len(dated) != sum(a["influences_sentiment"] for a in articles):
                result["price_confirmation"] = None
                result["news_price_divergence"] = False
                result["price_confirmation_status"] = "unavailable_news_newer_than_price"
            else:
                result["price_confirmation_status"] = "daily_direction_proxy"
        else:
            result["price_confirmation_status"] = "unavailable"
        return result


news_service = NewsService()
