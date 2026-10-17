import asyncio
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from quantplus_intelligence.news.archive import NewsArchive
from quantplus_intelligence.news.deduplicator import deduplicate
from quantplus_intelligence.news.official import normalize_rows, parse_nse_time
from quantplus_intelligence.news.provider import ProviderResult
from quantplus_intelligence.news.registry import ConnectorRegistry
from quantplus_intelligence.news.service import NewsService

UTC = timezone.utc
NOW = datetime(2026, 10, 14, 8, 0, tzinfo=UTC)  # 13:30 IST


def test_nse_wall_times_are_ist_not_utc():
    parsed = parse_nse_time("14-Oct-2026 12:30:00")
    assert parsed.astimezone(UTC) == datetime(2026, 10, 14, 7, 0, tzinfo=UTC)
    assert parse_nse_time("2026-10-14T12:30:00+00:00").astimezone(UTC).hour == 12
    assert parse_nse_time("yesterday afternoon") is None


def test_ambiguous_and_future_announcements_are_quarantined():
    rows = [
        {"headline": "Board meeting outcome", "an_dt": "14-Oct-2026 12:30:00", "attchmntFile": "https://nsearchives.nseindia.com/x.pdf"},
        {"headline": "Unparseable time", "an_dt": "sometime"},
        {"headline": "From the future", "an_dt": "14-Oct-2026 18:00:00"},
    ]
    articles, quarantined = normalize_rows("RELIANCE", rows, 10, now=NOW)
    assert [a["title"] for a in articles] == ["Board meeting outcome"]
    assert articles[0]["published_at"] == "2026-10-14T07:00:00+00:00"
    assert articles[0]["source_time_zone"].startswith("Asia/Kolkata")
    assert articles[0]["attachment_url"].endswith("x.pdf")
    assert articles[0]["available_at"] == NOW.isoformat()
    assert {q["reason"] for q in quarantined} == {"AMBIGUOUS_TIMESTAMP", "FUTURE_TIMESTAMP"}


def article(i, title, minutes, source="Wire"):
    return {"id": f"a{i}", "title": title, "source": source, "provider": "test",
            "published_at": (NOW - timedelta(minutes=minutes)).isoformat(), "url": f"https://x/{i}"}


def test_clusters_keep_earliest_evidence_and_lineage():
    items = [
        article(1, "Infosys wins 2 billion dollar deal", 10, "Paper A"),
        article(2, "Infosys wins 2 billion dollar deal - Paper B", 30, "Paper B"),
        article(3, "Infosys wins 3 billion dollar deal", 5, "Paper C"),
    ]
    kept = deduplicate(items)
    assert len(kept) == 2, "Different numbers are different developments"
    syndicated = next(a for a in kept if a["cluster"]["size"] == 2)
    assert syndicated["id"] == "a2", "The earliest known report represents the cluster"
    assert syndicated["cluster"]["sources"] == ["Paper A", "Paper B"]
    assert syndicated["cluster"]["latest_published_at"] == items[0]["published_at"]


def test_archive_is_append_only_with_correction_lineage(tmp_path):
    async def scenario():
        archive = NewsArchive(tmp_path / "news.sqlite3")
        first = await archive.record([article(1, "Q2 profit rises 10%", 20)], observed_at="2026-10-14T07:40:00+00:00")
        assert first[0]["version"] == 1
        same = await archive.record([article(1, "Q2 profit rises 10%", 20)], observed_at="2026-10-14T07:50:00+00:00")
        assert same[0]["first_seen_at"] == "2026-10-14T07:40:00+00:00", "Re-observation keeps first sight"
        corrected = await archive.record([article(1, "Q2 profit rises 12% (corrected)", 20)], observed_at="2026-10-14T07:55:00+00:00")
        assert corrected[0]["version"] == 2
        assert corrected[0]["first_seen_at"] == "2026-10-14T07:40:00+00:00"
        versions = archive.versions(article(1, "", 0))
        assert [v["version"] for v in versions] == [1, 2]
        assert versions[1]["supersedes"] == versions[0]["content_hash"]
        with sqlite3.connect(tmp_path / "news.sqlite3") as db, pytest.raises(sqlite3.DatabaseError):
            db.execute("UPDATE news_items SET raw = '{}'")
    asyncio.run(scenario())


def test_identical_text_from_different_stories_keeps_independent_lineage(tmp_path):
    async def scenario():
        archive = NewsArchive(tmp_path / "news.sqlite3")
        first = article(1, "Same headline", 10)
        second = {**first, "id": "different-story"}
        results = await archive.record([first, second])
        assert results[0]["content_hash"] != results[1]["content_hash"]
        assert len(archive.versions(first)) == 1
        assert len(archive.versions(second)) == 1
        repeated = await asyncio.gather(archive.record([first]), archive.record([first]))
        assert all(items[0]["version"] == 1 for items in repeated)
        assert len(archive.versions(first)) == 1
    asyncio.run(scenario())


def test_registry_separates_empty_results_from_failures_and_opens_circuit():
    registry = ConnectorRegistry()
    registry.register("feed", "rss", "public", 2)
    clock = [100.0]
    assert registry.admit("feed", lambda: clock[0]) is None
    assert registry.admit("feed", lambda: clock[0]) is None
    assert registry.admit("feed", lambda: clock[0]) == "budget_exhausted"
    registry.success("feed", empty=True)
    assert registry.status()[0]["status"] == "available" and registry.status()[0]["empty_results"] == 1
    clock[0] += 61  # the per-minute budget window has passed
    for _ in range(3):
        registry.failure("feed", "timeout", lambda: clock[0])
    assert registry.admit("feed", lambda: clock[0]) == "circuit_open"
    clock[0] += 16  # first backoff is 15 seconds
    assert registry.admit("feed", lambda: clock[0]) is None


class FakeProvider:
    name = "fake_feed"

    def __init__(self, result):
        self.result = result

    async def search(self, query, limit=20):
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


class NoCache:
    async def get_or_load(self, key, ttl, load):
        return await load()


def test_service_archives_and_reports_connector_status(tmp_path):
    async def scenario():
        items = [article(1, "Reliance announces expansion", 15), article(2, "Reliance announces expansion", 20, "Other")]
        service = NewsService(provider=FakeProvider(ProviderResult(articles=items, provider="fake_feed")),
                              cache_layer=NoCache(), archive=NewsArchive(tmp_path / "news.sqlite3"))
        result = await service.stock_news("RELIANCE")
        assert result["counts"]["fetched"] == 2 and result["counts"]["deduplicated"] == 1
        assert result["provider_status"]["archived"] is True
        assert any(c["name"] == "fake_feed" for c in result["provider_status"]["connectors"])
        assert all("content_hash" in a for a in result["articles"])
        failing = NewsService(provider=FakeProvider(RuntimeError("down")), cache_layer=NoCache(), archive=None)
        down = await failing.stock_news("TCS")
        assert down["provider_status"]["status"] == "unavailable"
        assert down["articles"] == []
    asyncio.run(scenario())


def test_namesakes_and_hindi_headlines_do_not_become_company_evidence():
    from quantplus_intelligence.news.relevance import language, relevance
    from quantplus_intelligence.news.resolver import resolve

    catalog = [{"symbol": "HDFCBANK", "company": "HDFC Bank Limited", "sector": "Financial Services"},
               {"symbol": "TMPV", "company": "Tata Motors Passenger Vehicles Limited", "sector": "Automobile"}]
    bank = resolve("HDFCBANK", catalog)
    life = {"title": "HDFC Life premiums jump in September", "published_at": NOW.isoformat()}
    own = {"title": "HDFC Bank raises deposit rates", "published_at": NOW.isoformat()}
    assert relevance(life, bank, now=NOW) <= 25
    assert relevance(own, bank, now=NOW) >= 85
    tmpv = resolve("TMPV", catalog)
    assert "Jaguar Land Rover" in tmpv.aliases
    assert language("एचडीएफसी बैंक के शेयर चढ़े") == "hi"
    assert language("HDFC Bank के शेयर") == "mixed"
    assert language("HDFC Bank shares rise") == "en"


def test_event_extraction_types_spans_and_abstains():
    from quantplus_intelligence.news.events import extract_event
    from quantplus_intelligence.news.resolver import resolve

    infy = resolve("INFY", [{"symbol": "INFY", "company": "Infosys Limited", "sector": "IT"}])
    event = extract_event({"title": "Infosys Q2 FY27 net profit rises 8% YoY to Rs 7,300 crore"}, infy)
    assert event["type"] == "earnings" and event["issuer"] == "INFY"
    assert event["period"] == "Q2FY27" and event["direction"] == "up"
    assert event["amounts"][0] == {"currency": "INR", "value": 7300.0, "unit": "crore", "span": event["amounts"][0]["span"]}
    title = "Infosys Q2 FY27 net profit rises 8% YoY to Rs 7,300 crore"
    start, end = event["amounts"][0]["span"]
    assert title[start:end].lower().startswith("rs 7,300")
    assert event["comparison_basis"] == "yoy" and event["certainty"] == "reported"
    rumour = extract_event({"title": "Infosys reportedly in talks for acquisition"}, infy)
    assert rumour["type"] == "merger/acquisition" and rumour["certainty"] == "speculative"
    mixed = extract_event({"title": "Infosys results: revenue rises, margin falls"}, infy)
    assert mixed["direction"] is None, "Conflicting directions abstain"
    assert extract_event({"title": "Infosys campus photographs"}, infy) is None


def test_impact_score_ignores_the_same_day_price_move():
    from quantplus_intelligence.news.impact import impact

    base = {"source": "Reuters", "published_at": NOW.isoformat(), "category": "earnings",
            "relevance_score": 80, "title": "Company reports results"}
    calm = impact(base, {"change_pct": 0.1}, now=NOW)
    moving = impact(base, {"change_pct": -6.0}, now=NOW)
    assert calm["impact_score"] == moving["impact_score"]
    assert moving["price_context"]["attributable_to_article"] is False
