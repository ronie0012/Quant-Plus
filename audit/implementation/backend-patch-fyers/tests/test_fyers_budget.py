import asyncio

import pytest

from app.data.fyers_provider import RequestBudget


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    async def sleep(self, seconds):
        self.now += seconds


def test_budget_waits_within_limits_and_exhausts_beyond_max_wait():
    async def scenario():
        clock = Clock()
        budget = RequestBudget(per_second=2, per_minute=3, per_day=100, max_wait=2)
        for _ in range(2):
            await budget.acquire(clock, clock.sleep)
        start = clock.now
        await budget.acquire(clock, clock.sleep)  # waits for the per-second window
        assert clock.now - start == pytest.approx(1.0)
        with pytest.raises(RuntimeError, match="budget exhausted"):
            await budget.acquire(clock, clock.sleep)  # per-minute window needs ~59 s
        assert budget.stats["requests"] == 3 and budget.stats["budget_exhausted"] == 1
    asyncio.run(scenario())


def test_rate_limit_opens_circuit_with_backoff():
    async def scenario():
        clock = Clock()
        budget = RequestBudget(per_second=10, per_minute=100, per_day=1000, max_wait=1)
        budget.failure(429, clock)
        with pytest.raises(RuntimeError, match="backoff"):
            await budget.acquire(clock, clock.sleep)
        clock.now += 1.01
        await budget.acquire(clock, clock.sleep)
        budget.failure(503, clock)
        assert budget.open_until - clock.now == pytest.approx(2.0)
        budget.success()
        assert budget.backoff == 1.0
    asyncio.run(scenario())


def test_defaults_do_not_assume_prime_plan(monkeypatch):
    for key in ("FYERS_DATA_MAX_PER_SECOND", "FYERS_DATA_MAX_PER_MINUTE", "FYERS_DATA_MAX_PER_DAY"):
        monkeypatch.delenv(key, raising=False)
    limits = RequestBudget().health()["limits"]
    assert limits == {"per_second": 4, "per_minute": 45, "per_day": 4800}
