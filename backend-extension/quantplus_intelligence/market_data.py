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

IST = timezone(timedelta(hours=5, minutes=30))
slots = asyncio.Semaphore(4)
request_stats = ContextVar("sentiment_request_stats", default=None)


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
        return age <= (RULES["quote_open_max_age_seconds"] if session == "open" else
                       RULES["quote_closed_max_age_days"] * 86400)
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


class ExistingMarketData:
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
        return quotes

    async def stock(self, symbol):
        async def load():
            session = await self.session()
            quotes = await self.equities([symbol], session)
            return {"quote": quotes.get(symbol), "market_session": session,
                    "data_quality": "GOOD" if symbol in quotes and session else "DEGRADED",
                    "confidence": 1 if symbol in quotes and session else 0, "updated_at": utcnow().isoformat()}
        return await cache.get_or_load("quote:" + symbol, config.market_ttl_seconds, load)

    async def indices(self, session):
        from app.data.fyers_provider import fyers
        try:
            # Equity snapshots add '-EQ'; indices require fully qualified symbols.
            # Reuse the same authenticated HTTP transport, retry/token logic and credentials.
            count_request()
            data = await fyers.get("quotes", {"symbols": ",".join(INDEX_SYMBOLS.values())})
            by_name = {row.get("n"): row.get("v", {}) for row in data.get("d", []) if row.get("s") == "ok"}
            quotes = {}
            for name, symbol in INDEX_SYMBOLS.items():
                quote = raw_quote(symbol, by_name.get(symbol, {}), session)
                if quote_valid(quote, session):
                    quotes[name] = quote
            return quotes
        except Exception as error:
            log("market_index_failure", error_type=type(error).__name__)
            return {}

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
        return {**value, "collector": {**value["collector"], "cache_hits": self.cache_hits}}

    async def _collect(self, stats, session):
            membership = await self.data.universe()
            symbols = membership.get("symbols", [])
            equities, indices = await asyncio.gather(
                self.data.equities(symbols, session) if symbols else asyncio.sleep(0, result={}),
                self.data.indices(session),
            )
            index_names = ("VIX", "NIFTY", "BANK", "IT", "AUTO", "PHARMA", "FMCG", "METAL", "ENERGY", "REALTY") if session == "closed" else ("VIX", "NIFTY")
            index_history_values = await asyncio.gather(*(self.data.index_history(name) for name in index_names))
            index_histories = {name: value for name, value in zip(index_names, index_history_values)}
            equities = {symbol: dict(q) for symbol, q in equities.items()}
            # Warm a bounded number of requests. Valid baselines last six hours;
            # failures have a five-minute cooldown and don't starve other stocks.
            now = time.monotonic()
            jobs = []
            provider_history_available = True
            if self.data is market_data:
                try:
                    from app.data.fyers_provider import fyers
                    provider_history_available = bool(fyers.token())
                except Exception:
                    provider_history_available = False
            for symbol in sorted(equities):
                for intraday in (False, True) if session == "open" else (False,):
                    key = (symbol, intraday)
                    cached = self.baselines.get(key)
                    if provider_history_available and (not cached or cached[0] <= now):
                        jobs.append(key)
            jobs.sort(key=lambda key: self.baselines.get(key, (0,))[0])
            jobs = jobs[:config.snapshot_history_calls if session == "open" else min(10, config.snapshot_history_calls)]

            async def history(key):
                symbol, intraday = key
                value = {"candles": []}
                if hasattr(self.data, "stock_history"):
                    try:
                        value = await self.data.stock_history(symbol, "1D" if intraday else "6M")
                    except TypeError:
                        value = await self.data.stock_history(symbol)
                    except Exception:
                        value = None
                success = value and value.get("source") == "fyers" and value.get("candles")
                ttl = config.intraday_baseline_ttl_seconds if intraday else config.daily_history_ttl_seconds
                self.baselines[key] = (now + (ttl if success else 300), value or {})
            await asyncio.gather(*(history(key) for key in jobs))
            history_by_symbol = {s: self.baselines[(s, False)][1] for s in equities if (s, False) in self.baselines}
            intraday_by_symbol = {s: self.baselines[(s, True)][1] for s in equities if (s, True) in self.baselines}
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
                "collector": {**stats, "history_loads": len(jobs), "breadth_symbols_requested": len(symbols)},
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
