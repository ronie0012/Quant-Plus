"""Bounded, read-only FYERS data calls. Live prices use the WebSocket feed."""
from __future__ import annotations

import time
import asyncio
from datetime import datetime, timedelta, timezone

import httpx
from app.data.fyers_auth import access_token


import os
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


class FyersData:
    def __init__(self):
        self.client = None
        self.invalid_token = ""
        self.market_cache = None
        self.market_lock = asyncio.Lock()
        self.budget = RequestBudget()

    def token(self):
        value = access_token()
        return value if value and value != self.invalid_token else ""

    async def get(self, path, params=None):
        token = self.token()
        if not token:
            raise RuntimeError("Fyers login required")
        if self.client is None:
            self.client = httpx.AsyncClient(timeout=10)
        await self.budget.acquire()
        response = await self.client.get("https://api-t1.fyers.in/data/" + path,
                                         params=params, headers={"Authorization": token})
        if response.status_code == 429 or response.status_code >= 500:
            self.budget.failure(response.status_code)
            raise RuntimeError("Fyers market data temporarily unavailable")
        self.budget.success()
        if response.status_code in (401, 403):
            self.invalid_token = token
            raise RuntimeError("Fyers login required")
        response.raise_for_status()
        data = response.json()
        if data.get("s") != "ok":
            if data.get("code") in (-15, -16) or "token" in str(data.get("message", "")).lower():
                self.invalid_token = token
            raise RuntimeError("Fyers market-data request unavailable")
        return data

    async def snapshot(self, symbol):
        snapshots = await self.snapshots([symbol])
        if symbol not in snapshots:
            raise ValueError("Fyers symbol not available")
        return snapshots[symbol]

    async def snapshots(self, symbols):
        if len(symbols) > 50:
            raise ValueError("Fyers quote snapshot limit is 50 symbols")
        result = await self.get("quotes", {"symbols": ",".join(f"NSE:{s}-EQ" for s in symbols)})
        rows = result.get("d", [])
        out = {}
        for row in rows:
            if row.get("s") != "ok":
                continue
            value = row.get("v", {})
            if float(value.get("lp", 0) or 0) <= 0:
                continue
            name = row.get("n", "")
            symbol = name.removeprefix("NSE:").removesuffix("-EQ")
            if symbol in symbols:
                out[symbol] = value
        return out

    async def depth(self, symbol):
        data = await self.get("depth", {"symbol": f"NSE:{symbol}-EQ", "ohlcv_flag": 1})
        return data.get("d", {}).get(f"NSE:{symbol}-EQ", {})

    async def session(self):
        async with self.market_lock:
            return await self._session()

    async def _session(self):
        token = self.token()
        if self.market_cache and self.market_cache[0] == token and time.monotonic() - self.market_cache[1] < 30:
            return self.market_cache[2]
        data = await self.get("marketStatus")
        rows = data.get("marketStatus", [])
        state = next((row.get("status", "") for row in rows
                      if str(row.get("exchange", "")).upper() in ("NSE", "10")
                      and str(row.get("segment", "")).upper() in ("CM", "CASH", "EQ", "10")
                      and str(row.get("market_type", "")).upper() == "NORMAL"), "")
        session = "open" if state.upper() == "OPEN" else "closed" if state else None
        self.market_cache = (token, time.monotonic(), session)
        return session

    async def history(self, symbol, range_name):
        resolution, interval, days = {"1D": ("1", "1m", 7), "1W": ("15", "15m", 7),
                                      "1M": ("60", "60m", 31), "6M": ("D", "1d", 184),
                                      "1Y": ("D", "1d", 365)}[range_name]
        now = datetime.now(timezone.utc)
        data = await self.get("history", {
            "symbol": f"NSE:{symbol}-EQ", "resolution": resolution, "date_format": "0",
            "range_from": str(int((now - timedelta(days=days)).timestamp())),
            "range_to": str(int(now.timestamp())), "cont_flag": "1"})
        from app.data.live_market import number, IST
        candles = []
        for row in data.get("candles", []):
            if len(row) < 6:
                continue
            values = [number(value) for value in row[:6]]
            if any(value is None for value in values) or values[0] > now.timestamp():
                continue
            candles.append(dict(zip(("time", "open", "high", "low", "close", "volume"), values)))
        candles.sort(key=lambda bar: bar["time"])
        if not candles:
            raise ValueError("No Fyers candles available")
        if range_name == "1D":
            day = datetime.fromtimestamp(candles[-1]["time"], IST).date()
            candles = [bar for bar in candles if datetime.fromtimestamp(bar["time"], IST).date() == day]
        return {"symbol": symbol, "range": range_name, "interval": interval, "source": "fyers",
                "delayed": False, "candles": candles,
                "as_of": datetime.fromtimestamp(candles[-1]["time"], timezone.utc).isoformat()}

    async def close(self):
        if self.client:
            await self.client.aclose()
            self.client = None


fyers = FyersData()
