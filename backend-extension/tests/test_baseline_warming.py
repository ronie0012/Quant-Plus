"""Offline baseline planning regressions: no config, broker imports, or HTTP."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier

import pytest

from quantplus_intelligence.baselines import BaselineWarmer, validate_baseline


IST = timezone(timedelta(hours=5, minutes=30))
NOW = datetime(2026, 10, 19, 10, 30, tzinfo=IST)
SYMBOLS = [f"S{i:02}" for i in range(50)]


def at(seconds):
    return {"now": NOW + timedelta(seconds=seconds), "monotonic": seconds}


def prior_days(count):
    day = NOW.date()
    result = []
    while len(result) < count:
        day -= timedelta(days=1)
        if day.weekday() < 5:
            result.append(day)
    return result


def candle(day, minute=555, volume=100):
    timestamp = datetime.combine(day, datetime.min.time(), IST) + timedelta(minutes=minute)
    return {"time": timestamp.timestamp(), "open": 99, "high": 101, "low": 98,
            "close": 100, "volume": volume}


def daily(count=15):
    return {"source": "fyers", "interval": "1d",
            "candles": [candle(day, volume=7500) for day in prior_days(count)]}


def intraday(count=5):
    return {"source": "fyers", "interval": "5m",
            "candles": [candle(day, minute) for day in prior_days(count) for minute in range(555, 930, 5)]}


def finish(warmer, jobs, seconds, *, success=True):
    for request in jobs:
        payload = (intraday() if request.intraday else daily()) if success else None
        assert warmer.complete(request, payload, **at(seconds)) is success


@pytest.mark.parametrize("budget", [1, 3, 6, 8])
def test_fifty_symbol_cold_warm_is_bounded_paired_and_fair_before_ticks(budget):
    cache = {}
    warmer = BaselineWarmer(cache, call_budget=budget, allow_daily_fallback=True)
    assert warmer.baselines is cache
    calls = []
    for refresh in range((100 + budget - 1) // budget):
        seconds = refresh * 45
        jobs = warmer.plan(reversed(SYMBOLS), **at(seconds))
        assert len(jobs) <= budget
        assert warmer.progress(SYMBOLS, **at(seconds))["queued"] == len(jobs)
        # Completion does not release this refresh's provider-call budget.
        finish(warmer, jobs, seconds + 1)
        assert warmer.plan(SYMBOLS, **at(seconds + 1)) == ()
        calls.extend(request.key for request in jobs)
        if len(calls) >= 20:
            assert warmer.progress(SYMBOLS, **at(seconds + 1))["ready"]

    assert calls == [(symbol, kind) for symbol in SYMBOLS for kind in (False, True)]
    assert len(set(calls[:20])) == 20
    assert {symbol for symbol, _ in calls[:20]} == set(SYMBOLS[:10])
    progress = warmer.progress(SYMBOLS, **at(seconds + 1))
    assert progress == {"requested": 50, "queued": 0, "usable_daily": 50, "usable_intraday": 50,
                        "in_cooldown": 0, "minimum_samples": 10, "paired": 50,
                        "usable_samples": 50, "ready": True, "allow_daily_fallback": True}
    daily_map, intraday_map = warmer.histories(SYMBOLS, **at(seconds + 1))
    assert set(daily_map) == set(intraday_map) == set(SYMBOLS)


def test_all_failures_visit_every_key_before_retrying_and_retries_rotate():
    warmer = BaselineWarmer(call_budget=6)
    calls = []
    for refresh in range(34):
        seconds = refresh * 45
        jobs = warmer.plan(SYMBOLS, **at(seconds))
        assert len(jobs) <= 6
        calls.extend(request.key for request in jobs)
        finish(warmer, jobs, seconds + 1, success=False)
    expected = [(symbol, kind) for symbol in SYMBOLS for kind in (False, True)]
    assert calls[:100] == expected
    assert calls[100:200] == expected
    progress = warmer.progress(SYMBOLS, **at(seconds + 1))
    assert not progress["ready"] and progress["usable_samples"] == 0
    assert progress["in_cooldown"] > 0
    assert warmer.histories(SYMBOLS, **at(seconds + 1)) == ({}, {})


def test_failure_cooldown_is_from_completion_and_does_not_block_other_names():
    warmer = BaselineWarmer(call_budget=2)
    jobs = warmer.plan(["A", "B"], **at(0))
    finish(warmer, jobs, 10, success=False)
    assert warmer.progress(["A", "B"], **at(10))["in_cooldown"] == 2
    other = warmer.plan(["A", "B"], **at(45))
    assert {request.symbol for request in other} == {"B"}
    finish(warmer, other, 46)
    assert warmer.plan(["A", "B"], **at(309)) == ()
    retries = warmer.plan(["A", "B"], **at(310))
    assert [request.key for request in retries] == [("A", False), ("A", True)]
    finish(warmer, retries, 311)
    assert warmer.progress(["A", "B"], **at(311))["in_cooldown"] == 0
    assert warmer.progress(["A", "B"], **at(311))["paired"] == 2


def test_ready_counterpart_is_prioritized_over_an_unpaired_retry():
    warmer = BaselineWarmer(call_budget=2)
    jobs = warmer.plan(["A", "B"], **at(0))
    finish(warmer, jobs, 1, success=False)
    jobs = warmer.plan(["A", "B"], **at(45))
    for request in jobs:
        assert warmer.complete(request, daily() if not request.intraday else None, **at(46)) is (not request.intraday)
    # At equal attempt counts, complete B's useful pair before A's old failures.
    jobs = warmer.plan(["A", "B"], **at(346))
    assert jobs[0].key == ("B", True)
    assert len(jobs) == 2


@pytest.mark.parametrize("is_intraday,count", [(False, 14), (True, 4)])
def test_partial_histories_are_not_cached_for_six_hours_or_exported(is_intraday, count):
    warmer = BaselineWarmer(call_budget=2)
    jobs = warmer.plan(["A"], **at(0))
    request = next(job for job in jobs if job.intraday == is_intraday)
    payload = intraday(count) if is_intraday else daily(count)
    result = validate_baseline(payload, intraday=is_intraday, exchange_date=NOW.date())
    assert not result.usable and result.samples == count and result.payload is None
    assert not warmer.complete(request, payload, **at(1))
    assert warmer.baselines[request.key] == (301, {})
    assert warmer.progress(["A"], **at(1))["usable_samples"] == 0
    assert warmer.get("A", is_intraday, **at(300)) is None
    retries = warmer.plan(["A"], **at(301))
    assert any(job.key == request.key for job in retries)


@pytest.mark.parametrize("is_intraday", [False, True])
def test_today_and_future_candles_cannot_supply_missing_completed_samples(is_intraday):
    payload = intraday(4) if is_intraday else daily(14)
    for day in (NOW.date(), NOW.date() + timedelta(days=1)):
        payload["candles"].extend([candle(day, minute) for minute in range(555, 930, 5)] if is_intraday else [candle(day)])
    result = validate_baseline(payload, intraday=is_intraday, exchange_date=NOW.date())
    assert not result.usable and result.samples == (4 if is_intraday else 14)


@pytest.mark.parametrize("is_intraday", [False, True])
def test_adequate_histories_export_only_valid_completed_sessions_and_copy_provider_data(is_intraday):
    payload = intraday() if is_intraday else daily()
    expected_count = len(payload["candles"])
    if is_intraday:
        # A sixth, incomplete prior day must not dilute the denominator.
        payload["candles"].append(candle(prior_days(6)[-1]))
    payload["candles"].extend([candle(NOW.date()), candle(NOW.date() + timedelta(days=1))])
    payload["candles"].reverse()
    result = validate_baseline(payload, intraday=is_intraday, exchange_date=NOW.date())
    assert result.usable and result.samples == (5 if is_intraday else 15)
    candles = result.payload["candles"]
    assert len(candles) == expected_count
    assert [row["time"] for row in candles] == sorted(row["time"] for row in candles)
    assert all(datetime.fromtimestamp(row["time"], IST).date() < NOW.date() for row in candles)
    payload["candles"][0]["volume"] = -1
    assert all(row["volume"] > 0 for row in candles)


@pytest.mark.parametrize("defect", ["missing", "duplicate", "off_grid", "extra", "negative", "nan", "bool", "zero_session", "overflow"])
def test_incomplete_or_abnormal_intraday_sessions_do_not_count(defect):
    payload = intraday()
    if defect == "missing":
        payload["candles"].pop()
    elif defect == "duplicate":
        payload["candles"][-1] = dict(payload["candles"][-2])
    elif defect == "off_grid":
        payload["candles"][-1]["time"] += 1
    elif defect == "extra":
        payload["candles"].append(candle(prior_days(5)[-1], 930))
    elif defect in ("negative", "nan", "bool"):
        payload["candles"][-1]["volume"] = {"negative": -1, "nan": float("nan"), "bool": True}[defect]
    elif defect == "zero_session":
        for row in payload["candles"][-75:]:
            row["volume"] = 0
    else:
        for row in payload["candles"][-75:]:
            row["volume"] = 1e308
    result = validate_baseline(payload, intraday=True, exchange_date=NOW.date())
    assert not result.usable and result.samples == 4


def test_zero_intraday_bars_are_allowed_inside_a_positive_complete_session():
    payload = intraday()
    payload["candles"][0]["volume"] = 0
    assert validate_baseline(payload, intraday=True, exchange_date=NOW.date()).usable


@pytest.mark.parametrize("defect", ["duplicate_day", "zero", "negative", "infinite", "bool", "bad_timestamp"])
def test_daily_days_are_distinct_positive_and_finite(defect):
    payload = daily()
    if defect == "duplicate_day":
        payload["candles"][-1] = dict(payload["candles"][-2])
    elif defect == "bad_timestamp":
        payload["candles"][-1]["time"] = 1e100
    else:
        payload["candles"][-1]["volume"] = {"zero": 0, "negative": -1, "infinite": float("inf"), "bool": True}[defect]
    assert not validate_baseline(payload, intraday=False, exchange_date=NOW.date()).usable


@pytest.mark.parametrize("payload,is_intraday", [
    (None, False), ({"source": "fyers", "candles": []}, False),
    ({"source": "unavailable", "candles": []}, True),
    ({"source": "yahoo", "candles": daily()["candles"]}, False),
    ({**intraday(), "interval": "1m"}, True),
    ({**intraday(), "interval": None}, True),
    ({**intraday(), "interval_seconds": 60}, True),
    ({**daily(), "interval": "5m"}, False),
])
def test_unavailable_wrong_provenance_or_wrong_interval_is_never_ready(payload, is_intraday):
    assert not validate_baseline(payload, intraday=is_intraday, exchange_date=NOW.date()).usable


def test_legacy_daily_and_explicit_seconds_intraday_intervals_are_supported():
    payload = daily()
    payload.pop("interval")
    assert validate_baseline(payload, intraday=False, exchange_date=NOW.date()).usable
    payload = intraday()
    payload.pop("interval")
    payload["interval_seconds"] = 300
    result = validate_baseline(payload, intraday=True, exchange_date=NOW.date())
    assert result.usable and result.payload["interval"] == "5m"


def test_legacy_cache_is_revalidated_and_expired_and_partial_payloads_are_released():
    cache = {("A", False): (21600, daily()), ("A", True): (21600, intraday(4)),
             ("B", False): (0, daily()), ("B", True): (0, intraday())}
    warmer = BaselineWarmer(cache)
    assert warmer.histories(["A", "B"], **at(1))[0].keys() == {"A"}
    assert cache[("A", True)] == (301, {})
    assert ("B", False) not in cache and ("B", True) not in cache
    assert warmer.progress(["A", "B"], **at(1))["in_cooldown"] == 1
    # Replacing a legacy entry cannot bypass validation even after a good read.
    cache[("A", False)] = (21600, daily(3))
    assert warmer.get("A", **at(2)) is None
    assert cache[("A", False)] == (302, {})


def test_success_expires_exactly_six_hours_after_completion_and_reads_never_reuse_it():
    warmer = BaselineWarmer(call_budget=2)
    jobs = warmer.plan(["A"], **at(0))
    finish(warmer, jobs, 10)
    assert warmer.get("A", **at(21609)) is not None
    assert warmer.histories(["A"], **at(21610)) == ({}, {})
    assert warmer.baselines == {}
    assert warmer.progress(["A"], **at(21610))["usable_samples"] == 0
    assert len(warmer.plan(["A"], **at(21610))) == 2


def test_legacy_cache_deletion_releases_payloads_instead_of_leaving_usable_references():
    cache = {}
    warmer = BaselineWarmer(cache, call_budget=2)
    jobs = warmer.plan(["A"], **at(0))
    finish(warmer, jobs, 1)
    cache.pop(("A", True))
    assert warmer.get("A", True, **at(2)) is None
    assert warmer.progress(["A"], **at(2))["usable_intraday"] == 0
    cache.clear()
    assert warmer.histories(["A"], **at(3)) == ({}, {})
    assert warmer.get("A", **at(21602)) is None


@pytest.mark.parametrize("expiry", [float("nan"), float("inf"), None])
def test_invalid_legacy_expiry_cannot_make_a_payload_immortal(expiry):
    cache = {("A", False): (expiry, daily())}
    warmer = BaselineWarmer(cache)
    assert warmer.get("A", **at(0)) is None
    assert cache == {}


def test_ist_date_rollover_invalidates_intraday_and_old_inflight_results_not_daily():
    before = datetime(2026, 10, 19, 18, 29, 50, tzinfo=timezone.utc)  # 23:59:50 IST
    after = before + timedelta(seconds=46)  # Same UTC date, next exchange date.
    warmer = BaselineWarmer(call_budget=4)
    jobs = warmer.plan(["A", "B"], now=before, monotonic=0)
    for request in jobs[:2]:
        assert warmer.complete(request, intraday() if request.intraday else daily(), now=before, monotonic=1)
    assert warmer.get("A", True, now=before, monotonic=1) is not None
    daily_map, intraday_map = warmer.histories(["A", "B"], now=after, monotonic=46)
    assert set(daily_map) == {"A"} and intraday_map == {}
    assert ("A", True) not in warmer.baselines
    for request in jobs[2:]:
        assert not warmer.complete(request, intraday() if request.intraday else daily(), now=after, monotonic=46)
    assert ("B", False) not in warmer.baselines and ("B", True) not in warmer.baselines
    assert {request.key for request in warmer.plan(["A", "B"], now=after, monotonic=46)} == {
        ("A", True), ("B", False), ("B", True)}


@pytest.mark.parametrize("allow_fallback", [True, False])
def test_daily_fallback_policy_is_explicit_in_exports_and_honest_progress(allow_fallback):
    warmer = BaselineWarmer(call_budget=2, minimum_samples=1, allow_daily_fallback=allow_fallback)
    jobs = warmer.plan(["A"], **at(0))
    for request in jobs:
        warmer.complete(request, daily() if not request.intraday else intraday(4), **at(1))
    progress = warmer.progress(["A"], **at(1))
    assert progress["usable_daily"] == 1 and progress["usable_intraday"] == 0
    assert progress["paired"] == 0 and progress["in_cooldown"] == 1
    assert progress["ready"] is allow_fallback
    assert progress["usable_samples"] == int(allow_fallback)
    daily_map, intraday_map = warmer.histories(["A"], **at(1))
    assert bool(daily_map) is allow_fallback and intraday_map == {}
    assert warmer.get("A", **at(1)) is not None  # Still available for technicals.


def test_intraday_alone_counts_as_one_usable_sample_without_daily_fallback():
    warmer = BaselineWarmer(call_budget=2, minimum_samples=1, allow_daily_fallback=False)
    for request in warmer.plan(["A"], **at(0)):
        warmer.complete(request, intraday() if request.intraday else None, **at(1))
    progress = warmer.progress(["A"], **at(1))
    assert progress["usable_samples"] == 1 and progress["ready"]
    assert progress["paired"] == 0
    assert set(warmer.histories(["A"], **at(1))[1]) == {"A"}


def test_concurrent_refreshes_share_budget_and_cannot_double_reserve():
    warmer = BaselineWarmer(call_budget=6)
    barrier = Barrier(2)

    def plan():
        barrier.wait()
        return warmer.plan(SYMBOLS, **at(0))

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: plan(), range(2)))
    jobs = [request for batch in results for request in batch]
    assert len(jobs) == len({request.key for request in jobs}) == 6
    # A new refresh window still cannot exceed the in-flight cap.
    assert warmer.plan(SYMBOLS, **at(45)) == ()
    finish(warmer, jobs, 46)
    assert len(warmer.plan(SYMBOLS, **at(46))) == 6


def test_reservation_timeouts_and_stale_completions_cannot_resurrect_histories():
    warmer = BaselineWarmer(call_budget=2, reservation_seconds=60)
    old = warmer.plan(["A"], **at(0))
    assert warmer.plan(["A"], **at(60)) == ()
    progress = warmer.progress(["A"], **at(60))
    assert progress["queued"] == 0 and progress["in_cooldown"] == 2
    finish(warmer, old, 61, success=False)  # Late failure is ignored too.
    for request in old:
        assert not warmer.complete(request, intraday() if request.intraday else daily(), **at(61))
    assert warmer.histories(["A"], **at(61)) == ({}, {})
    new = warmer.plan(["A"], **at(360))
    assert len(new) == 2
    for request in old:
        assert not warmer.complete(request, daily(), **at(361))
    finish(warmer, new, 361)
    # Repeated completion cannot overwrite a success with an empty cooldown.
    for request in new:
        assert not warmer.complete(request, None, **at(362))
    assert warmer.progress(["A"], **at(362))["paired"] == 1


def test_universe_bound_membership_removal_disabled_transport_and_daily_only_mode():
    warmer = BaselineWarmer(call_budget=6)
    supplied = SYMBOLS + ["ZZZ", "S00", "", None]
    assert warmer.plan(supplied, enabled=False, **at(0)) == ()
    assert warmer.progress(supplied, **at(0))["requested"] == 50
    jobs = warmer.plan(supplied, include_intraday=False, **at(0))
    assert [request.key for request in jobs] == [(symbol, False) for symbol in SYMBOLS[:6]]
    finish(warmer, jobs, 1)
    old = warmer.plan(supplied, include_intraday=False, **at(45))
    warmer.plan(["NEW"], **at(46))
    assert warmer.baselines == {}
    for request in old:
        assert not warmer.complete(request, daily(), **at(47))
    assert warmer.progress(["NEW"], **at(47))["usable_samples"] == 0


def test_zero_budget_and_naive_clock_boundary():
    warmer = BaselineWarmer(call_budget=0)
    assert warmer.plan(SYMBOLS, **at(0)) == ()
    assert warmer.progress([], **at(0))["requested"] == 0
    with pytest.raises(ValueError, match="timezone-aware"):
        warmer.plan(SYMBOLS, now=NOW.replace(tzinfo=None), monotonic=0)
