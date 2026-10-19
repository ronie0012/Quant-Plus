"""Pure, guarded, idempotent source edits for the existing LiveMarket.

No imports of the backend, SDK, settings or credentials. --check only compiles
the proposed source in memory; installation is owned by the backend installer.
Anchors deliberately fail closed if the upstream methods have changed.
"""
from __future__ import annotations

import argparse
import ast
from pathlib import Path


def _edit(source, method, before, after):
    tree = ast.parse(source)
    cls = next((node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "LiveMarket"), None)
    node = next((node for node in (cls.body if cls else []) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == method), None)
    if node is None:
        raise ValueError(f"LiveMarket.{method} missing; review the shared feed patch before installing")
    lines = source.splitlines(keepends=True)
    block = "".join(lines[node.lineno - 1:node.end_lineno])
    if block.count(after) == 1:
        return source
    if block.count(before) != 1:
        raise ValueError(f"LiveMarket.{method} changed; review the shared feed patch before installing")
    lines[node.lineno - 1:node.end_lineno] = [block.replace(before, after, 1)]
    return "".join(lines)


def patched_live_market(source):
    source = _edit(source, "__init__", "        self.listeners = {}", "        self.shared_stream_version = 1\n        self.listeners = {}")
    source = _edit(source, "_subscription", "        async with self.socket_lock:\n            if self.socket and self.connected:",
        """        async with self.socket_lock:
            # Interests may change while waiting for the shared socket lock.
            symbols = list(dict.fromkeys(s for s in symbols if bool(self.listeners.get(s)) == subscribe))
            if symbols and self.socket and self.connected:""")
    source = _edit(source, "_subscription", 'symbols=[f"NSE:{s}-EQ" for s in symbols]',
        'symbols=[f"NSE:{s}" if s.endswith("-INDEX") else f"NSE:{s}-EQ" for s in symbols]')
    source = _edit(source, "_subscription", 'depth_symbols = [s for s in symbols if s in self.deep_symbols]',
        'depth_symbols = [s for s in symbols if s in self.deep_symbols and not s.endswith("-INDEX") and bool(self.listeners.get(s)) == subscribe]')
    source = _edit(source, "_tick", 'if not isinstance(message, dict) or not message.get("symbol", "").startswith("NSE:"):',
        'if not isinstance(message, dict) or not isinstance(message.get("symbol"), str) or not message["symbol"].startswith("NSE:"):')
    source = _edit(source, "_tick", '        # SymbolUpdate may contain partial fields; merge with the previous tick.\n        previous = self.fyers_quotes.get(symbol, {})',
        '''        # A price must be paired with an authentic provider observation time.
        # Metadata-only frames cannot advance an old price's timestamp; neither
        # receipt time nor a previous tick's as_of can timestamp a new price.
        price = number(message.get("ltp"))
        if isinstance(message.get("ltp"), bool) or price is None or price <= 0:
            return
        timestamp = None
        fields = ("exch_feed_time", "last_traded_time") if symbol.endswith("-INDEX") else ("last_traded_time",)
        for field in fields:
            value = number(message.get(field))
            if not isinstance(message.get(field), bool) and value is not None and 0 < value <= time.time() + 60:
                timestamp = value
                break
        if timestamp is None:
            return
        previous = self.fyers_quotes.get(symbol, {})
        try:
            observed = datetime.fromtimestamp(timestamp, timezone.utc)
            previous_time = datetime.fromisoformat(previous["as_of"]) if previous.get("as_of") else None
            if previous_time and observed < previous_time:
                return  # Late/replayed frames cannot regress an observation.
            if previous_time and observed.astimezone(IST).date() != previous_time.astimezone(IST).date():
                previous = {}  # Do not carry yesterday's partial daily fields.
        except (TypeError, ValueError, OverflowError, OSError):
            return''')
    source = _edit(source, "_tick", '''payload = quote_payload(symbol, message.get("ltp", previous.get("price")),
                message.get("prev_close_price", previous.get("previous_close")),
                message.get("last_traded_time") or (
                    datetime.fromisoformat(previous["as_of"]).timestamp() if previous.get("as_of") else None),''',
        '''payload = quote_payload(symbol, price,
                message.get("prev_close_price", previous.get("previous_close")),
                timestamp,''')
    source = _edit(source, "_start_socket", '''            def opened():
                self.loop.call_soon_threadsafe(self._on_open)

            def closed(*_):
                self.loop.call_soon_threadsafe(setattr, self, "connected", False)

            def received(message):
                self.loop.call_soon_threadsafe(self._tick, message)

            self.socket = data_ws.FyersDataSocket(''',
        '''            def current(callback, *args):
                # SDK reconnects reuse the instance; replaced-token callbacks do not.
                if self.socket is socket:
                    callback(*args)

            def opened():
                self.loop.call_soon_threadsafe(current, self._on_open)

            def closed(*_):
                self.loop.call_soon_threadsafe(current, setattr, self, "connected", False)

            def received(message):
                self.loop.call_soon_threadsafe(current, self._tick, message)

            socket = data_ws.FyersDataSocket(''')
    source = _edit(source, "_start_socket", '''            threading.Thread(target=self.socket.connect, daemon=True, name="fyers-display-feed").start()
            self._socket_token = token''',
        '''            self.socket = socket
            self._socket_token = token
            threading.Thread(target=socket.connect, daemon=True, name="fyers-display-feed").start()''')
    source = _edit(source, "refresh_fyers_connection", '''    async def refresh_fyers_connection(self):
        async with self.socket_close_lock:
            if self.socket:
                await asyncio.to_thread(self.socket.close_connection)
            self.socket = None
            self.connected = False
            self._socket_token = ""
            self._socket_attempt = 0
            self.bootstrap_tokens.clear()
            self.snapshot_attempts.clear()
            self.fyers_quotes.clear()
            self.last_fyers.clear()
            self.depth_raw.clear()
            self.depth_received.clear()
            self.history_cache.clear()
            if self.listeners:
                self._start_socket()''',
        '''    async def refresh_fyers_connection(self, *, only_if_token_changed=False):
        async def refresh():
            async with self.socket_close_lock, self.socket_lock:
                if only_if_token_changed and (not self.socket or fyers.token() == self._socket_token):
                    return
                if self.socket:
                    await asyncio.to_thread(self.socket.close_connection)
                self.socket = None
                self.connected = False
                self._socket_token = ""
                self._socket_attempt = 0
                self.bootstrap_tokens.clear()
                self.snapshot_attempts.clear()
                self.fyers_quotes.clear()
                self.last_fyers.clear()
                self.depth_raw.clear()
                self.depth_received.clear()
                self.history_cache.clear()
                if self.listeners:
                    self._start_socket()

        # A departing stock fallback or cancelled sentiment collection must not
        # interrupt the shared close/reset while the SDK thread is still closing.
        await asyncio.shield(asyncio.create_task(refresh()))''')
    source = _edit(source, "_fallback", 'await self.refresh_fyers_connection()',
        'await self.refresh_fyers_connection(only_if_token_changed=True)')
    # _on_open stays shared: it already resubscribes ALL listener keys, including
    # our bounded owner interests. Require that behavior rather than monkeypatch.
    tree = ast.parse(source)
    cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "LiveMarket")
    opened = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == "_on_open")
    if 'self._subscription(list(self.listeners), True)' not in ast.get_source_segment(source, opened):
        raise ValueError("LiveMarket._on_open must resubscribe every shared listener")
    compile(source, "live_market.py", "exec")
    return source


def patched_fyers_tests(source):
    """Update the legacy partial-frame expectation to the fresh-price contract."""
    before = 'assert payload["price"] == 101 and payload["average_price"] == 99.5'
    after = 'assert payload["price"] == 100 and payload["average_price"] == 99.5  # Timestamp-free price frame is rejected.'
    if after in source:
        return source
    if source.count(before) != 1:
        raise ValueError("FYERS partial-frame test changed; review it before installing")
    return source.replace(before, after, 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--check", action="store_true", required=True, help="read/compile only; never writes the backend")
    args = parser.parse_args()
    path = args.backend / "app" / "data" / "live_market.py"
    original = path.read_text(encoding="utf-8")
    updated = patched_live_market(original)
    print("Shared LiveMarket patch: " + ("already installed" if updated == original else "compatible; installation required"))
