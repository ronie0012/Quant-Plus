"""Bounded TTL cache with single-flight loads; replace via Cache protocol for Redis."""
from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from typing import Any, Awaitable, Callable, Protocol


class Cache(Protocol):
    async def get_or_load(self, key: str, ttl: float, loader: Callable[[], Awaitable[Any]]) -> Any: ...


class MemoryCache:
    def __init__(self, max_entries=512, clock=time.monotonic):
        self.max_entries = max_entries
        self.clock = clock
        self.values = OrderedDict()
        self.pending = {}

    async def get_or_load(self, key, ttl, loader):
        cached = self.values.get(key)
        if cached and self.clock() < cached[0]:
            self.values.move_to_end(key)
            return cached[1]
        if key not in self.pending:
            task = asyncio.create_task(self._load(key, ttl, loader))
            self.pending[key] = task
            # Consume errors even if every HTTP requester disconnects.
            task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
        return await asyncio.shield(self.pending[key])

    async def _load(self, key, ttl, loader):
        try:
            value = await loader()
            # Explicit failures are retried sooner; empty successful feeds keep normal TTL.
            actual_ttl = ttl
            if isinstance(value, dict) and value.get("data_quality") == "DEGRADED":
                from .config import config
                actual_ttl = min(ttl, config.failure_ttl_seconds)
            self.values[key] = (self.clock() + actual_ttl, value)
            self.values.move_to_end(key)
            while len(self.values) > self.max_entries:
                self.values.popitem(last=False)
            return value
        finally:
            self.pending.pop(key, None)


cache = MemoryCache()
