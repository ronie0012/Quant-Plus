import asyncio
from datetime import date, datetime, timedelta, timezone

from quantplus_intelligence.calibration import (
    completed_bars,
    evaluate_snapshot,
    fully_matured,
    reliability_by_regime,
)
from quantplus_intelligence.exchange_calendar import is_trading_day, session_days
from quantplus_intelligence.history import (
    LABEL_VERSION,
    InMemorySentimentHistoryRepository,
    SQLiteSentimentHistoryRepository,
    SentimentSnapshot,
    historical_signal_reliability,
)
from quantplus_intelligence.scheduler import SentimentMaturationJob

UTC = timezone.utc
# Wednesday 14 Oct 2026, 10:02:30 IST: between 5-minute bar ends.
DECISION = datetime(2026, 10, 14, 4, 32, 30, tzinfo=UTC)


def snapshot(at=DECISION, score=75, **metadata):
    return SentimentSnapshot(timestamp=at.isoformat(), score=score, label="BULLISH", confidence=.5,
                             data_quality="PARTIAL", regime="TEST", metadata=dict(metadata))


def provider_bars(start, count, step=300, base=100.0):
    return [{"time": (start + timedelta(seconds=step * i)).timestamp(), "close": base + i} for i in range(count)]


def test_calendar_matches_official_holidays_and_abstains_for_unverified_years():
    assert is_trading_day(date(2026, 10, 20)) is False  # Dussehra
    assert is_trading_day(date(2026, 1, 15)) is False  # election holiday circular
    assert is_trading_day(date(2026, 10, 21)) is True
    assert is_trading_day(date(2026, 11, 8)) is False  # Muhurat timings unverified
    assert is_trading_day(date(2027, 1, 4)) is None
    assert session_days(date(2026, 10, 16), date(2026, 10, 21)) == ["2026-10-16", "2026-10-19", "2026-10-21"]


def test_completed_bars_use_bar_end_and_availability_delay():
    start = datetime(2026, 10, 14, 4, 25, tzinfo=UTC)
    bars = completed_bars(provider_bars(start, 2), 300, now=start + timedelta(seconds=630), delay_seconds=60)
    assert bars[0]["bar_end"] == (start + timedelta(minutes=5)).isoformat()
    assert bars[0]["completed"] is True
    assert bars[1]["completed"] is False  # ends 10:00 IST + 60s delay > now


def test_baseline_is_the_last_bar_known_at_decision_without_lookahead():
    start = datetime(2026, 10, 14, 4, 25, tzinfo=UTC)  # bar ending 04:30
    now = DECISION + timedelta(hours=2)
    bars = completed_bars(provider_bars(start, 40), 300, now=now, delay_seconds=0)
    point = evaluate_snapshot(snapshot(), bars, now=now)
    assert point.metadata["label_base_bar_end"] == datetime(2026, 10, 14, 4, 30, tzinfo=UTC).isoformat()
    # Base close 100 at 04:30; 15 minutes later is three bars on: 103.
    assert point.forward_return_15m == 3
    assert point.forward_return_1h == 12
    assert point.forward_return_eod is None  # session close not yet observed
    assert point.metadata["label_version"] == LABEL_VERSION


def test_stale_baselines_abstain():
    old = datetime(2026, 10, 14, 4, 0, tzinfo=UTC)
    bars = completed_bars(provider_bars(old, 1), 300, now=DECISION + timedelta(hours=1))
    assert evaluate_snapshot(snapshot(), bars, now=DECISION + timedelta(hours=1)).forward_return_15m is None


def test_only_current_version_labels_count_toward_reliability():
    legacy = [snapshot(DECISION - timedelta(minutes=i)) for i in range(30)]
    for point in legacy:
        point.forward_return_1h = 1  # a legacy label without the current version
    assert reliability_by_regime(legacy) == {}
    assert historical_signal_reliability(legacy, 70, "up", minimum=30) is None
    for point in legacy:
        point.metadata["label_version"] = LABEL_VERSION
    assert reliability_by_regime(legacy)["TEST"]["label_version"] == LABEL_VERSION


class FakeData:
    def __init__(self, candles):
        self.candles = candles
        self.calls = 0

    async def index_intraday(self, name):
        self.calls += 1
        return {"source": "fyers", "interval_seconds": 300, "candles": self.candles}


def test_maturation_job_persists_outcomes_and_retries_pending(tmp_path):
    async def scenario():
        repository = SQLiteSentimentHistoryRepository(tmp_path / "history.sqlite3")
        legacy = snapshot(forward_return_note="legacy")
        legacy.forward_return_1h = 9  # legacy, must be quarantined not reused
        await repository.save(legacy)
        start = datetime(2026, 10, 14, 4, 25, tzinfo=UTC)
        data = FakeData(provider_bars(start, 12))
        job = SentimentMaturationJob(data, repository, delay_seconds=0)
        result = await job.run_once(now=DECISION + timedelta(minutes=40))
        assert result["updated"] == 1
        [stored] = await repository.list(DECISION - timedelta(days=1), DECISION + timedelta(days=1))
        assert stored.forward_return_15m == 3
        assert stored.forward_return_1h is None
        assert stored.metadata["quarantined_labels"] == [{"forward_return_1h": 9}]
        assert not fully_matured(stored)
        # A fresh repository instance reads the same durable rows.
        reopened = SQLiteSentimentHistoryRepository(tmp_path / "history.sqlite3")
        assert (await reopened.list(DECISION - timedelta(days=1), DECISION + timedelta(days=1)))[0].forward_return_15m == 3
        # Later, the one-hour horizon matures on a subsequent run.
        data.candles = provider_bars(start, 30)
        await job.run_once(now=DECISION + timedelta(hours=2))
        [stored] = await reopened.list(DECISION - timedelta(days=1), DECISION + timedelta(days=1))
        assert stored.forward_return_1h == 12
    asyncio.run(scenario())


def test_maturation_abstains_without_provider_bars():
    async def scenario():
        repository = InMemorySentimentHistoryRepository()
        await repository.save(snapshot())

        class Offline:
            async def index_intraday(self, name):
                return {"source": "unavailable", "candles": []}

        result = await SentimentMaturationJob(Offline(), repository).run_once(now=DECISION + timedelta(hours=1))
        assert result["updated"] == 0 and "unavailable" in result["reason"]
        [stored] = await repository.list(DECISION - timedelta(days=1), DECISION + timedelta(days=1))
        assert stored.forward_return_15m is None
    asyncio.run(scenario())
