"""Adapters around the EXISTING FYERS and LiveMarket instances, not broker clients."""
from __future__ import annotations

import asyncio
import csv
import io
import time
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone

import httpx
from .cache import cache
from .common import log, number, utcnow
from .config import config, INDEX_SYMBOLS, RULES
from .baselines import BaselineWarmer

IST = timezone(timedelta(hours=5, minutes=30))
slots = asyncio.Semaphore(4)
request_stats = ContextVar("sentiment_request_stats", default=None)
RECOVERABLE_INDICES = ("NIFTY", "BANK", "VIX")
INDEX_CANDLE_METHOD = "completed_1m_candle"


def count_request():
    stats = request_stats.get()
    if stats is not None:
        stats["fyers_request_attempts"] += 1


def market_status(session, now=None):
    local = (now or utcnow()).astimezone(IST)
    # FYERS is authoritative, including special weekend trading sessions.
    if session == "open":
        return "OPEN"
    if local.weekday() >= 5 or local.date().isoformat() in config.market_holidays:
        return "HOLIDAY"
    if session == "closed" and (9, 0) <= (local.hour, local.minute) < (9, 15):
        return "PRE_OPEN"
    return "CLOSED" if session == "closed" else "UNKNOWN"


def quote_valid(quote, session=None, now=None):
    if not quote or quote.get("source") != "fyers" or not number(quote.get("price")):
        return False
    try:
        now = now or utcnow()
        timestamp = datetime.fromisoformat(quote["as_of"])
        age = (now - timestamp).total_seconds()
        if age < -60:
            return False
        if quote.get("observation_method") == INDEX_CANDLE_METHOD:
            if age < 0 or timestamp.astimezone(IST).date() != now.astimezone(IST).date():
                return False
        # Only a verified closed session permits last-session observations. An
        # unavailable session must not turn an hours-old quote into live input.
        return age <= (RULES["quote_closed_max_age_days"] * 86400 if session == "closed" else
                       RULES["quote_open_max_age_seconds"])
    except (KeyError, TypeError, ValueError):
        return False


def raw_quote(symbol, raw, session):
    from app.data.live_market import quote_payload
    timestamp = number(raw.get("tt"))
    if timestamp is None:
        return None  # No timestamp means no assertion of freshness.
    try:
        return {**quote_payload(symbol, raw.get("lp"), raw.get("prev_close_price"), timestamp, "fyers",
                               open=raw.get("open_price"), high=raw.get("high_price"),
                               low=raw.get("low_price"), volume=raw.get("volume"),
                               average_price=raw.get("atp") or raw.get("avg_trade_price")), "market_session": session}
    except (ValueError, OSError, OverflowError):
        return None


def same_day_previous_close(raw, now):
    """Use only an explicit previous close in a successfully returned same-day row."""
    timestamp, previous = number(raw.get("tt")), number(raw.get("prev_close_price"))
    if not timestamp or not previous or previous <= 0 or isinstance(raw.get("prev_close_price"), bool):
        return None
    try:
        observed = datetime.fromtimestamp(timestamp, timezone.utc)
        if observed > now or observed.astimezone(IST).date() != now.astimezone(IST).date():
            return None
    except (ValueError, OSError, OverflowError):
        return None
    return previous, observed.isoformat()


def completed_index_quote(name, raw, rows, now=None):
    """Recover a price from a genuine completed FYERS 1m bar, never receipt time.

    Bar OHLC belongs to the minute, not to the trading session. In particular its
    open is not exposed as session open to the daily momentum calculation.
    """
    now = now or utcnow()
    previous = same_day_previous_close(raw, now)
    if name not in RECOVERABLE_INDICES or previous is None or not isinstance(rows, list):
        return None
    candidates = []
    for row in rows[:60]:  # A ten-minute request should contain at most eleven rows.
        if not isinstance(row, (list, tuple)) or len(row) < 6 or any(isinstance(v, bool) for v in row[:6]):
            continue
        values = [number(v) for v in row[:6]]
        if any(v is None for v in values):
            continue
        timestamp, op, high, low, close, volume = values
        if timestamp <= 0 or timestamp % 60 or min(op, high, low, close) <= 0 or volume < 0:
            continue
        if high < max(op, low, close) or low > min(op, high, close):
            continue
        try:
            start = datetime.fromtimestamp(timestamp, timezone.utc)
            end = start + timedelta(minutes=1)
        except (ValueError, OSError, OverflowError):
            continue
        age = (now - end).total_seconds()
        if not 0 <= age <= RULES["quote_open_max_age_seconds"]:
            continue
        if start.astimezone(IST).date() != now.astimezone(IST).date() or end.astimezone(IST).date() != now.astimezone(IST).date():
            continue
        candidates.append((timestamp, start, end, op, high, low, close))
    if not candidates:
        return None
    _, start, end, op, high, low, close = max(candidates, key=lambda row: row[0])
    from app.data.live_market import quote_payload
    return {**quote_payload(INDEX_SYMBOLS[name], close, previous[0], end.timestamp(), "fyers"),
            "market_session": "open", "observation_method": INDEX_CANDLE_METHOD,
            "observation_source": "fyers_history", "interval_seconds": 60,
            "bar_start": start.isoformat(), "bar_end": end.isoformat(),
            "bar_ohlc": {"open": op, "high": high, "low": low, "close": close},
            "previous_close_source": "fyers_rest_same_trading_date",
            "previous_close_as_of": previous[1], "data_quality": "PARTIAL"}


class ExistingMarketData:
    def __init__(self, feed=None):
        self.feed = feed
        self.equity_diagnostics = {}
        self.index_diagnostics = {}

    async def prepare(self, symbols, session):
        if self.feed is None:
            from .live_feed import sentiment_feed
            self.feed = sentiment_feed
        status = await self.feed.ensure(symbols, session)
        if session == "open" and status["state"] == "active":
            # The first collection may precede the socket's initial frames. Wait
            # briefly once per collection; never stamp receipt time onto prices.
            deadline = time.monotonic() + config.stream_warm_wait_seconds
            while time.monotonic() < deadline:
                fresh = sum(quote_valid(self.feed.quote(s), session) for s in symbols)
                indices = sum(quote_valid(self.feed.quote(s), session) for s in INDEX_SYMBOLS)
                if fresh >= len(symbols) * RULES["min_breadth_coverage"] and indices == len(INDEX_SYMBOLS):
                    break
                await asyncio.sleep(.1)
        return self.feed.status()

    async def release_stream(self):
        if self.feed is not None:
            await self.feed.ensure([], "closed")

    def stream_indices(self, session):
        if self.feed is None or session != "open":
            return {}
        return {name: value for name in INDEX_SYMBOLS
                if quote_valid(value := self.feed.quote(name), session) and number(value.get("change_pct")) is not None}

    async def session(self):
        from app.data.fyers_provider import fyers
        try:
            if not fyers.market_cache or time.monotonic() - fyers.market_cache[1] >= 30:
                count_request()
            return await fyers.session()
        except Exception:
            return None

    async def equities(self, symbols, session):
        from app.data.fyers_provider import fyers
        from app.data.live_market import market
        quotes = {s: dict(market.fyers_quotes[s]) for s in symbols
                  if quote_valid(market.fyers_quotes.get(s), session)}
        missing = [s for s in symbols if s not in quotes]
        if missing:
            try:
                # The existing provider batches at most 50 equity symbols per call.
                async with slots:
                    count_request()
                    raw = await fyers.snapshots(missing[:50])
                for symbol, row in raw.items():
                    quote = raw_quote(symbol, row, session)
                    if quote_valid(quote, session):
                        quotes[symbol] = quote
            except Exception as error:
                log("market_provider_failure", provider="existing_fyers", error_type=type(error).__name__)
        # Re-read after REST awaits so a genuine stream tick wins over a stale
        # bootstrap and newly arriving universe ticks are not lost for 45 seconds.
        streamed = {s: dict(market.fyers_quotes[s]) for s in symbols
                    if session == "open" and quote_valid(market.fyers_quotes.get(s), session)}
        quotes.update(streamed)
        self.equity_diagnostics = {"requested": len(symbols), "usable": len(quotes),
                                   "fresh_stream": len(streamed), "missing": len(symbols) - len(quotes)}
        return quotes

    async def stock(self, symbol):
        session = await self.session()
        async def load():
            quotes = await self.equities([symbol], session)
            return {"quote": quotes.get(symbol), "market_session": session,
                    "data_quality": "GOOD" if symbol in quotes and session else "DEGRADED",
                    "confidence": 1 if symbol in quotes and session else 0, "updated_at": utcnow().isoformat()}
        return await cache.get_or_load(f"quote:{symbol}:{session}", config.market_ttl_seconds, load)

    async def indices(self, session):
        live = self.stream_indices(session)
        if len(live) == len(INDEX_SYMBOLS):
            self.index_diagnostics = {name: {"state": "fresh_stream", "as_of": q["as_of"]} for name, q in live.items()}
            return live
        async def load():
            from app.data.fyers_provider import fyers
            try:
                # Reuse authenticated transport, credentials and its request budget.
                async with slots:
                    count_request()
                    data = await fyers.get("quotes", {"symbols": ",".join(INDEX_SYMBOLS.values())})
                by_name = {row.get("n"): row.get("v", {}) for row in data.get("d", []) if row.get("s") == "ok"}
                quotes = self.stream_indices(session)
                diagnostics = {}
                for name, symbol in INDEX_SYMBOLS.items():
                    quote = raw_quote(symbol, by_name.get(symbol, {}), session)
                    if name not in quotes and quote_valid(quote, session):
                        quotes[name] = quote
                    if name not in quotes:
                        diagnostics[name] = {"state": "unavailable", "reason": "No fresh timestamped FYERS stream or REST observation"}
                # Strict allowlist: at most three additional calls, no equity or
                # other-sector history fan-out. No daily direction without a
                # same-day REST previous close, even if history might have a price.
                if session == "open":
                    names = [name for name in RECOVERABLE_INDICES if name not in quotes
                             and same_day_previous_close(by_name.get(INDEX_SYMBOLS[name], {}), utcnow())]
                    async def recover(name):
                        return await self._recent_index_quote(name, by_name[INDEX_SYMBOLS[name]])
                    recovered = await asyncio.gather(*(recover(name) for name in names))
                    quotes.update({name: value for name, value in zip(names, recovered) if value is not None})
                for name, quote in quotes.items():
                    diagnostics[name] = {"state": quote.get("observation_method", "fresh_quote"), "as_of": quote["as_of"]}
                return {"quotes": quotes, "diagnostics": diagnostics, "data_quality": "PARTIAL" if quotes else "DEGRADED"}
            except Exception as error:
                log("market_index_failure", error_type=type(error).__name__)
                return {"quotes": {}, "diagnostics": {name: {"state": "unavailable", "reason": "FYERS index request failed or its request budget is unavailable"} for name in INDEX_SYMBOLS}, "data_quality": "DEGRADED"}
        ttl = config.market_ttl_seconds if session == "open" else config.closed_market_ttl_seconds
        result = await cache.get_or_load("market-index-quotes:" + str(session), ttl, load)
        # A cached one-minute observation must never be extended beyond freshness.
        quotes = {name: value for name, value in result["quotes"].items() if quote_valid(value, session)}
        quotes.update(self.stream_indices(session))
        self.index_diagnostics = dict(result.get("diagnostics", {}))
        for name, quote in quotes.items():
            self.index_diagnostics[name] = {"state": quote.get("observation_method", "fresh_quote"), "as_of": quote["as_of"]}
        return quotes

    async def _recent_index_quote(self, name, raw):
        if name not in RECOVERABLE_INDICES:
            return None
        from app.data.fyers_provider import fyers
        now = utcnow()
        try:
            async with slots:
                count_request()
                payload = await fyers.get("history", {"symbol": INDEX_SYMBOLS[name], "resolution": "1",
                    "date_format": "0", "range_from": str(int((now - timedelta(minutes=10)).timestamp())),
                    "range_to": str(int(now.timestamp())), "cont_flag": "1"})
            quote = completed_index_quote(name, raw, payload.get("candles", []), utcnow())
            log("market_index_candle_fallback", index=name, available=quote is not None,
                as_of=quote.get("as_of") if quote else None)
            return quote
        except Exception as error:
            log("market_index_candle_failure", index=name, error_type=type(error).__name__)
            return None

    async def index_history(self, name):
        async def load():
            from app.data.fyers_provider import fyers
            now = utcnow()
            try:
                async with slots:
                    count_request()
                    data = await fyers.get("history", {"symbol": INDEX_SYMBOLS[name], "resolution": "D",
                        "date_format": "0", "range_from": str(int((now - timedelta(days=60)).timestamp())),
                        "range_to": str(int(now.timestamp())), "cont_flag": "1"})
                candles = []
                for row in data.get("candles", []):
                    if len(row) >= 6 and all(number(v) is not None for v in row[:6]) and row[0] <= now.timestamp():
                        candles.append(dict(zip(("time", "open", "high", "low", "close", "volume"), row[:6])))
                return {"candles": sorted(candles, key=lambda x: x["time"]), "source": "fyers",
                        "data_quality": "GOOD" if candles else "DEGRADED"}
            except Exception:
                return {"candles": [], "data_quality": "DEGRADED"}
        return await cache.get_or_load("index-history:" + name, 300, load)

    async def index_intraday(self, name, days=7):
        """Five-minute index bars (stamped at bar start) for outcome maturation."""
        from app.data.fyers_provider import fyers
        now = utcnow()
        try:
            async with slots:
                count_request()
                data = await fyers.get("history", {"symbol": INDEX_SYMBOLS[name], "resolution": "5",
                    "date_format": "0", "range_from": str(int((now - timedelta(days=days)).timestamp())),
                    "range_to": str(int(now.timestamp())), "cont_flag": "1"})
            candles = [dict(zip(("time", "open", "high", "low", "close", "volume"), row[:6]))
                       for row in data.get("candles", []) if len(row) >= 6 and
                       all(number(v) is not None for v in row[:6]) and row[0] <= now.timestamp() and row[4] > 0]
            return {"source": "fyers", "interval_seconds": 300, "candles": sorted(candles, key=lambda c: c["time"])}
        except Exception as error:
            log("index_intraday_provider_failure", error_type=type(error).__name__)
            return {"source": "unavailable", "interval_seconds": 300, "candles": []}

    async def sentiment_history(self, symbol, intraday=False):
        """Bounded baseline request through the existing FYERS transport only.

        Daily histories already in LiveMarket are reused. Completed intraday
        sessions are kept by the collector for six hours (not refetched per UI).
        """
        from app.data.fyers_provider import fyers
        from app.data.live_market import market
        if not intraday:
            existing = market.history_cache.get((symbol, "6M", fyers.token()))
            if existing and existing[1].get("source") == "fyers" and time.monotonic() - existing[0] < config.daily_history_ttl_seconds:
                return existing[1]
        now = utcnow()
        try:
            async with slots:
                count_request()
                payload = await fyers.get("history", {"symbol": f"NSE:{symbol}-EQ", "resolution": "5" if intraday else "D",
                    "date_format": "0", "range_from": str(int((now-timedelta(days=15 if intraday else 184)).timestamp())),
                    "range_to": str(int(now.timestamp())), "cont_flag": "1"})
            candles = [dict(zip(("time", "open", "high", "low", "close", "volume"), row[:6]))
                       for row in payload.get("candles", []) if len(row) >= 6 and
                       all(number(v) is not None for v in row[:6]) and row[0] <= now.timestamp() and row[4] > 0 and row[5] >= 0]
            return {"source": "fyers", "interval": "5m" if intraday else "1d",
                    "candles": sorted(candles, key=lambda c: c["time"])}
        except Exception as error:
            log("sentiment_history_provider_failure", error_type=type(error).__name__)
            return {"source": "unavailable", "candles": []}

    async def stock_history(self, symbol, range_name="6M"):
        from app.data.live_market import market
        try:
            async with slots:
                return await market.history(symbol, range_name)
        except Exception:
            return None

    async def universe(self):
        async def load():
            # Refresh official membership daily. Do not use the research graph's frozen 37-stock set.
            for url in ("https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv",
                        "https://archives.nseindia.com/content/indices/ind_nifty50list.csv"):
                try:
                    async with httpx.AsyncClient(timeout=config.provider_timeout_seconds,
                        headers={"User-Agent": "Mozilla/5.0 QuantPlus/1.0"}) as client:
                        response = await client.get(url)
                    response.raise_for_status()
                    if len(response.content) > 200_000:
                        raise ValueError("Membership payload too large")
                    rows = list(csv.DictReader(io.StringIO(response.text.lstrip("\ufeff"))))
                    from .news.resolver import normalize_symbol
                    symbols = list(dict.fromkeys(normalize_symbol(r["Symbol"]) for r in rows))
                    if len(symbols) != 50:
                        raise ValueError("Expected exactly 50 official constituents")
                    return {"symbols": symbols, "industries": {normalize_symbol(r["Symbol"]): r.get("Industry", "") for r in rows},
                            "universe": "NIFTY_50", "source": url, "updated_at": utcnow().isoformat(), "data_quality": "GOOD"}
                except Exception as error:
                    log("universe_provider_failure", error_type=type(error).__name__)
            return {"symbols": [], "source": None, "updated_at": utcnow().isoformat(), "data_quality": "DEGRADED"}
        return await cache.get_or_load("nifty50-membership", 86400, load)


market_data = ExistingMarketData()


class MarketSnapshotCollector:
    """Collect one normalized market observation for all sentiment components.

    The collector is deliberately independent of the sentiment calculation.  A
    cached snapshot can therefore be reused by breadth, sector, VIX, volume and
    future analytics without issuing a request per frontend component.
    """

    def __init__(self, data=None, cache_layer=None):
        self.data = data or market_data
        self.cache = cache_layer or cache
        self.baselines = {}
        self.baseline_warmer = BaselineWarmer(
            self.baselines, call_budget=min(6, config.snapshot_history_calls),
            refresh_seconds=config.market_ttl_seconds,
            success_ttl_seconds=min(config.daily_history_ttl_seconds, config.intraday_baseline_ttl_seconds),
            minimum_samples=RULES["min_volume_samples"],
        )
        self._closed_histories = {}
        self.cache_hits = 0

    async def snapshot(self):
        loaded = False
        async def load():
            nonlocal loaded
            loaded = True
            stats = {"fyers_request_attempts": 0}
            token = request_stats.set(stats)
            try:
                return await self._collect(stats, session)
            finally:
                request_stats.reset(token)

        session = await self.data.session()
        ttl = config.market_ttl_seconds if session == "open" else config.closed_market_ttl_seconds
        value = await self.cache.get_or_load("market-snapshot:" + str(session), ttl, load)
        if not loaded:
            self.cache_hits += 1
            if self.baselines and session == "open":
                clocks = {"now": utcnow(), "monotonic": time.monotonic()}
                daily, intraday = self.baseline_warmer.histories(value["quotes"], **clocks)
                value = {**value, "history_by_symbol": daily, "intraday_by_symbol": intraday}
        return {**value, "collector": {**value["collector"], "cache_hits": self.cache_hits}}

    async def _collect(self, stats, session):
            membership = await self.data.universe()
            symbols = membership.get("symbols", [])
            feed_status = {}
            if hasattr(self.data, "prepare") and (self.data is market_data or getattr(self.data, "feed", None) is not None):
                feed_status = await self.data.prepare(symbols, session)
            equities, indices = await asyncio.gather(
                self.data.equities(symbols, session) if symbols else asyncio.sleep(0, result={}),
                self.data.indices(session),
            )
            index_names = ("VIX", "NIFTY", "BANK", "IT", "AUTO", "PHARMA", "FMCG", "METAL", "ENERGY", "REALTY") if session == "closed" else ("VIX", "NIFTY")
            index_history_values = await asyncio.gather(*(self.data.index_history(name) for name in index_names))
            index_histories = {name: value for name, value in zip(index_names, index_history_values)}
            equities = {symbol: dict(q) for symbol, q in equities.items()}
            # Warm official membership, not just whichever stock page happens to
            # have a tick. Six shared calls per refresh prevents a 50-stock burst.
            now = time.monotonic()
            provider_history_available = True
            if self.data is market_data:
                try:
                    from app.data.fyers_provider import fyers
                    provider_history_available = bool(fyers.token())
                except Exception:
                    provider_history_available = False
            jobs = self.baseline_warmer.plan(symbols, now=utcnow(), monotonic=now,
                include_intraday=session == "open", enabled=provider_history_available)

            async def history(job):
                symbol, intraday = job.symbol, job.intraday
                value = {"candles": []}
                if hasattr(self.data, "sentiment_history"):
                    # The display adapter's 1D history contains only the latest
                    # day and may use Yahoo. Sentiment needs prior complete
                    # five-minute FYERS sessions for equivalent-time baselines.
                    try:
                        value = await self.data.sentiment_history(symbol, intraday=intraday)
                    except Exception:
                        value = None
                elif hasattr(self.data, "stock_history"):
                    try:
                        value = await self.data.stock_history(symbol, "1D" if intraday else "6M")
                    except TypeError:
                        value = await self.data.stock_history(symbol)
                    except Exception:
                        value = None
                self.baseline_warmer.complete(job, value, now=utcnow(), monotonic=time.monotonic())
                if not intraday and value and value.get("source") == "fyers" and value.get("candles"):
                    # Keep original daily candles separately for verified closed
                    # session marks; volume baselines exclude the observed day.
                    self._closed_histories[symbol] = (time.monotonic() + config.daily_history_ttl_seconds, value)
            await asyncio.gather(*(history(job) for job in jobs))
            clocks = {"now": utcnow(), "monotonic": time.monotonic()}
            history_by_symbol, intraday_by_symbol = self.baseline_warmer.histories(
                equities, include_intraday=session == "open", **clocks)
            if session == "closed":
                history_by_symbol.update({s: value for s, (expiry, value) in self._closed_histories.items()
                                          if s in equities and expiry > clocks["monotonic"]})
            progress = self.baseline_warmer.progress(symbols, include_intraday=session == "open", **clocks)
            self._add_technical_metrics(equities, history_by_symbol)
            return {
                "session": session,
                "membership": membership,
                "quotes": equities,
                "indices": indices,
                "vix_history": index_histories.get("VIX", {"candles": []}),
                "nifty_history": index_histories.get("NIFTY", {"candles": []}),
                "index_histories": index_histories,
                "history_by_symbol": history_by_symbol,
                "intraday_by_symbol": intraday_by_symbol,
                "diagnostics": {"feed": feed_status, "equities": getattr(self.data, "equity_diagnostics", {}),
                                "indices": getattr(self.data, "index_diagnostics", {}), "baselines": progress},
                "collector": {**stats, "history_loads": len(jobs), "breadth_symbols_requested": len(symbols),
                              "feed": feed_status, "baselines": progress},
            }

    @staticmethod
    def _add_technical_metrics(quotes, histories):
        for symbol, history in histories.items():
            quote = quotes.get(symbol)
            candles = history.get("candles", []) if history else []
            if not quote or history.get("source") != "fyers":
                continue
            day = datetime.fromisoformat(quote.get("as_of", utcnow().isoformat())).astimezone(IST).date()
            closes = [c["close"] for c in candles if datetime.fromtimestamp(c["time"], IST).date() < day and number(c.get("close"))]
            if quote.get("average_price"):
                quote["vwap"] = quote["average_price"]
            if len(closes) >= 20:
                # EMA is calculated from the observed close series only; it is
                # absent until enough history exists rather than filled with 50.
                ema = closes[0]
                alpha = 2 / 21
                for close in closes[1:]:
                    ema = alpha * close + (1 - alpha) * ema
                quote["ema20"] = ema
            if len(closes) >= 50:
                quote["dma50"] = sum(closes[-50:]) / 50
