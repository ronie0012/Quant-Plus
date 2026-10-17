"""Prepare a reviewable, hash-guarded backend patch: a plan-aware FYERS data request budget.

Defaults sit just under the FYERS *Standard* data-API limits (5/s, 50/min, 5,000/day,
per the official FYERS support article checked 2026-10-14); a Prime plan must be
configured explicitly. Writes only under audit/implementation/backend-patch-fyers.
"""
from pathlib import Path
import hashlib
import json

backend = Path("D:/QP/agent-service")
output = Path("audit/implementation/backend-patch-fyers")
output.mkdir(parents=True, exist_ok=True)
manifest = []


def save(relative, updated):
    original = (backend / relative).read_bytes()
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(updated, encoding="utf-8", newline="")
    manifest.append({"path": relative, "before_sha256": hashlib.sha256(original).hexdigest(),
                     "after_sha256": hashlib.sha256(target.read_bytes()).hexdigest()})


path = "app/data/fyers_provider.py"
source = (backend / path).read_text(encoding="utf-8")
anchor = '''class FyersData:
    def __init__(self):
        self.client = None
        self.invalid_token = ""
        self.market_cache = None
        self.market_lock = asyncio.Lock()
'''
if anchor not in source:
    raise SystemExit("fyers_provider.py changed; inspect before preparing the budget patch")
budget = '''import os
from collections import deque


class RequestBudget:
    """Sliding-window FYERS data-API budget. It never assumes a higher plan than configured.

    Callers wait (bounded) for a free slot; a 429 or server error opens a circuit
    with exponential backoff so a struggling provider is not hammered.
    """

    def __init__(self, per_second=None, per_minute=None, per_day=None, max_wait=None):
        env = os.environ.get
        self.limits = ((1.0, int(per_second or env("FYERS_DATA_MAX_PER_SECOND", "4"))),
                       (60.0, int(per_minute or env("FYERS_DATA_MAX_PER_MINUTE", "45"))),
                       (86400.0, int(per_day or env("FYERS_DATA_MAX_PER_DAY", "4800"))))
        self.max_wait = float(max_wait or env("FYERS_DATA_MAX_WAIT_SECONDS", "5"))
        self.calls = deque()
        self.lock = asyncio.Lock()
        self.open_until = 0.0
        self.backoff = 1.0
        self.stats = {"requests": 0, "throttled": 0, "budget_exhausted": 0, "rate_limited": 0,
                      "server_errors": 0, "circuit_rejections": 0}

    async def acquire(self, clock=time.monotonic, sleep=asyncio.sleep):
        deadline = clock() + self.max_wait
        while True:
            async with self.lock:
                now = clock()
                if now < self.open_until:
                    self.stats["circuit_rejections"] += 1
                    raise RuntimeError("Fyers market data temporarily unavailable (provider backoff)")
                while self.calls and now - self.calls[0] >= 86400:
                    self.calls.popleft()
                wait = 0.0
                for window, limit in self.limits:
                    recent = [t for t in self.calls if now - t < window]
                    if len(recent) >= limit:
                        wait = max(wait, recent[-limit] + window - now)
                if wait <= 0:
                    self.calls.append(now)
                    self.stats["requests"] += 1
                    return
                if now + wait > deadline:
                    self.stats["budget_exhausted"] += 1
                    raise RuntimeError("Fyers request budget exhausted; retry later")
                self.stats["throttled"] += 1
            await sleep(wait)

    def success(self):
        self.backoff = 1.0

    def failure(self, status, clock=time.monotonic):
        self.stats["rate_limited" if status == 429 else "server_errors"] += 1
        self.open_until = clock() + self.backoff
        self.backoff = min(self.backoff * 2, 60.0)

    def health(self):
        return {"limits": {"per_second": self.limits[0][1], "per_minute": self.limits[1][1],
                           "per_day": self.limits[2][1]},
                "circuit_open": time.monotonic() < self.open_until,
                "used_last_day": len(self.calls), **self.stats}


'''
source = source.replace(anchor, budget + anchor + "        self.budget = RequestBudget()\n", 1)
old = '''        if self.client is None:
            self.client = httpx.AsyncClient(timeout=10)
        response = await self.client.get("https://api-t1.fyers.in/data/" + path,
                                         params=params, headers={"Authorization": token})
        if response.status_code in (401, 403):'''
new = '''        if self.client is None:
            self.client = httpx.AsyncClient(timeout=10)
        await self.budget.acquire()
        response = await self.client.get("https://api-t1.fyers.in/data/" + path,
                                         params=params, headers={"Authorization": token})
        if response.status_code == 429 or response.status_code >= 500:
            self.budget.failure(response.status_code)
            raise RuntimeError("Fyers market data temporarily unavailable")
        self.budget.success()
        if response.status_code in (401, 403):'''
if old not in source:
    raise SystemExit("FyersData.get changed; inspect before preparing the budget patch")
save(path, source.replace(old, new, 1))

test_path = "tests/test_fyers_budget.py"
target = output / test_path
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text('''import asyncio

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
''', encoding="utf-8", newline="")
manifest.append({"path": test_path, "before_sha256": None,
                 "after_sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
(output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Prepared {len(manifest)} files in {output}")
