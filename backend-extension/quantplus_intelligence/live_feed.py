"""Bounded sentiment interests on the application's EXISTING FYERS socket.

The caller supplies verified official NIFTY membership and the authoritative
FYERS session. Call ``ensure`` on each collection (including closed/unknown
sessions); it does not poll the session or wait for initial ticks. The parent
owns the bounded warm wait and quote freshness/quality validation.

Requires the installer's additive LiveMarket source patch. No subscribe_many,
REST snapshots, Yahoo tasks, depth seeding, socket client or credentials here.
"""
from __future__ import annotations

import asyncio
import re
from itertools import islice


def _equity_symbol(value):
    if not isinstance(value, str):
        return None
    symbol = value.strip().upper().removeprefix("NSE:").removesuffix("-EQ")
    return symbol if re.fullmatch(r"[A-Z0-9][A-Z0-9&-]{0,29}", symbol) and not symbol.endswith("-INDEX") else None


class SharedSentimentFeed:
    """One queue/owner, at most 50 equities + the 10 configured indices.

    Instances may share a market; releasing one only removes its own queue.
    Dependencies are lazy so importing this module cannot start a feed. The
    optional constructor arguments are for hermetic tests, not new providers.
    ``close`` is terminal; closed/unknown ``ensure`` calls are resumable.
    """

    def __init__(self, market=None, provider=None, *, index_symbols=None):
        self._market = market
        self._provider = provider
        self._indices = dict(index_symbols) if index_symbols is not None else None
        self._lock = asyncio.Lock()
        self._queue = asyncio.Queue(maxsize=60)
        self._owned = set()
        self._pending_unsubscribe = set()
        self._retry_subscribe = False
        self._closed = False
        self._state = "idle"
        self._reason = "not_ensured"

    def _bind(self):
        if self._market is None:
            from app.data.live_market import market
            self._market = market
        if self._provider is None:
            from app.data.fyers_provider import fyers
            self._provider = fyers
        if self._indices is None:
            from .config import INDEX_SYMBOLS
            self._indices = dict(INDEX_SYMBOLS)

    def _targets(self, equities):
        # Membership provenance belongs to the official-universe loader. Fail
        # closed for incomplete, duplicate or overlarge sets, never broaden it.
        try:
            values = list(islice(iter(equities), 51)) if not isinstance(equities, (str, bytes)) else []
        except TypeError:
            return None
        symbols = {_equity_symbol(value) for value in values}
        if len(values) != 50 or len(symbols) != 50 or None in symbols:
            return None
        indices = set(self._indices.values())
        if len(indices) != 10 or any(not isinstance(s, str) or not re.fullmatch(r"NSE:[A-Z0-9]+-INDEX", s) for s in indices):
            return None
        return symbols | {s.removeprefix("NSE:") for s in indices}

    async def _flush_unsubscribe(self):
        if not self._pending_unsubscribe:
            return
        removed = sorted(self._pending_unsubscribe)
        # The patched _subscription rechecks listeners under socket_lock. A
        # stock page joining while we await must not be unsubscribed on wire.
        await self._market._subscription(removed, False)
        for symbol in removed:
            # Keep preexisting depth intent until the shared unsubscribe sends
            # its DepthUpdate release too. Recheck ownership after that await.
            if not self._market.listeners.get(symbol):
                self._market.deep_symbols.discard(symbol)
        self._pending_unsubscribe.difference_update(removed)

    async def _release(self, symbols):
        cancelled = []
        for symbol in symbols:
            listeners = self._market.listeners.get(symbol)
            if listeners is not None:
                listeners.discard(self._queue)
                if not listeners:
                    self._market.listeners.pop(symbol, None)
                    self._pending_unsubscribe.add(symbol)
                    # These may predate us (a stock page left while we held an
                    # interest). Cancel tasks only when NO owner remains, before
                    # yielding; never cancel another active owner's work.
                    task = self._market.tasks.pop(symbol, None)
                    if task:
                        task.cancel()
                        cancelled.append(task)
            self._owned.discard(symbol)
        if cancelled:
            await asyncio.gather(*cancelled, return_exceptions=True)
        await self._flush_unsubscribe()

    async def ensure(self, equity_symbols, session):
        """Ensure 60 bounded interests iff ``session`` is exactly ``'open'``.

        Returns ``status()`` immediately after registration/subscription, not
        tick readiness. Repeated/concurrent calls are idempotent. Reconnects
        resubscribe all shared listeners in LiveMarket._on_open; token changes
        use its existing serialized refresh lifecycle. Unknown/closed sessions
        and invalid membership release this owner's interests.
        """
        async with self._lock:
            if self._closed:
                return self.status()
            if session != "open":
                self._state, self._reason = "idle", "session_closed" if session == "closed" else "session_unknown"
                try:
                    if self._market is not None:
                        await self._release(set(self._owned))
                except Exception:
                    self._reason = "release_failed"
                self._retry_subscribe = False
                return self.status()
            try:
                self._bind()
                if getattr(self._market, "shared_stream_version", None) != 1:
                    self._state, self._reason = "unavailable", "source_patch_required"
                    return self.status()
                targets = self._targets(equity_symbols)
                if targets is None:
                    self._state, self._reason = "unavailable", "invalid_universe"
                    await self._release(set(self._owned))
                    return self.status()
                self._market.loop = asyncio.get_running_loop()
                # Check/refresh is rechecked under the shared close/socket locks
                # by the patched method, including races with stock fallbacks.
                await self._market.refresh_fyers_connection(only_if_token_changed=True)
                if not self._provider.token():
                    self._state, self._reason = "unavailable", "login_required"
                    await self._release(set(self._owned))
                    return self.status()
                await self._release(self._owned - targets)
                added = []
                for symbol in sorted(targets):
                    listeners = self._market.listeners.setdefault(symbol, set())
                    if not listeners:
                        added.append(symbol)
                    listeners.add(self._queue)
                    self._owned.add(symbol)
                self._market._start_socket()
                self._state, self._reason = "active", None
                if self._retry_subscribe:
                    added = sorted(self._owned)
                if added:
                    self._retry_subscribe = True
                    await self._market._subscription(added, True)
                    self._retry_subscribe = False
            except Exception:
                # No provider exception text, tokens, URLs or private values in
                # diagnostics. Registered queues remain owned/releasable and
                # will be picked up by the shared reconnect callback.
                self._state, self._reason = "unavailable", "shared_feed_unavailable"
            return self.status()

    def quote(self, symbol):
        """Return a FYERS-cache copy; this makes NO assertion of freshness.

        Accepts bare/wire equities and index config aliases, wire names or bare
        names (NIFTY / NSE:NIFTY50-INDEX / NIFTY50-INDEX). The canonical shared
        cache/listener key is the bare name. Caller must still use quote_valid.
        """
        if self._market is None or not isinstance(symbol, str):
            return None
        name = symbol.strip().upper()
        name = (self._indices or {}).get(name, name).removeprefix("NSE:").removesuffix("-EQ")
        value = self._market.fyers_quotes.get(name)
        return dict(value) if value and value.get("source") == "fyers" else None

    def status(self):
        return {"state": self._state, "reason": self._reason, "owned_symbols": len(self._owned),
                "equity_symbols": sum(not s.endswith("-INDEX") for s in self._owned),
                "index_symbols": sum(s.endswith("-INDEX") for s in self._owned),
                "connected": bool(self._market is not None and self._market.connected),
                "queue_size": self._queue.qsize(), "queue_capacity": self._queue.maxsize,
                "pending_release": len(self._pending_unsubscribe)}

    def diagnostics(self):
        return self.status()

    async def close(self):
        """Terminal, idempotent owner release; never closes the shared socket."""
        async with self._lock:
            self._closed = True
            self._state, self._reason = "closed", "adapter_closed"
            try:
                if self._market is not None:
                    await self._release(set(self._owned))
            except Exception:
                self._reason = "release_failed"
            while not self._queue.empty():
                self._queue.get_nowait()


sentiment_feed = SharedSentimentFeed()
