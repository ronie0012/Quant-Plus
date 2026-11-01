"""Read-only terminal data, reusing the existing FYERS transport and research store."""
from __future__ import annotations

import asyncio
import math
import statistics
from datetime import datetime, timedelta, timezone
from urllib.parse import quote as urlquote

import httpx

from .cache import cache
from .common import log, number, utcnow
from .config import config
from .market_data import market_data, raw_quote, quote_valid, IST
from .market_structure import analyze_market_structure

INDICES = {
    "NIFTY": ("NIFTY 50", "NSE:NIFTY50-INDEX", "^NSEI"),
    "BANK": ("BANK NIFTY", "NSE:NIFTYBANK-INDEX", "^NSEBANK"),
    "VIX": ("INDIA VIX", "NSE:INDIAVIX-INDEX", "^INDIAVIX"),
    "SENSEX": ("SENSEX", "BSE:SENSEX-INDEX", "^BSESN"),
}
RANGES = {"1D": ("1", "1m", 7, "1d"), "1W": ("15", "15m", 7, "5d"),
          "1M": ("60", "60m", 31, "1mo"), "3M": ("D", "1d", 93, "3mo"),
          "6M": ("D", "1d", 184, "6mo"), "1Y": ("D", "1d", 366, "1y")}
history_slots = asyncio.Semaphore(4)
fundamental_slots = asyncio.Semaphore(2)
structure_ranges = {"1D", "1W", "1M"}


def candles_from(rows):
    result = {}
    for row in rows:
        if len(row) < 6:
            continue
        values = [number(v) for v in row[:6]]
        if any(v is None for v in values) or values[0] > utcnow().timestamp():
            continue
        ts, op, hi, lo, close, volume = values
        if min(op, hi, lo, close) <= 0 or volume < 0 or hi < max(op, lo, close) or lo > min(op, hi, close):
            continue
        result[ts] = dict(zip(("time", "open", "high", "low", "close", "volume"), values))
    return [result[key] for key in sorted(result)]


async def yahoo_chart(symbol, period="1d", interval="1m"):
    from app.data.live_market import market
    client = await market._http()
    async with market.yahoo_slots:
        response = await client.get(
            "https://query1.finance.yahoo.com/v8/finance/chart/" + urlquote(symbol, safe=""),
            params={"range": period, "interval": interval, "includePrePost": "false"})
    response.raise_for_status()
    results = response.json().get("chart", {}).get("result")
    if not results:
        raise ValueError("No provider history")
    return results[0]


async def overview():
    async def load():
        from app.data.fyers_provider import fyers
        from app.data.live_market import quote_payload
        session = await market_data.session()
        quotes = {}
        try:
            response = await fyers.get("quotes", {"symbols": ",".join(v[1] for v in INDICES.values())})
            values = {row.get("n"): row.get("v", {}) for row in response.get("d", []) if row.get("s") == "ok"}
            for symbol, (_, fyers_symbol, _) in INDICES.items():
                value = raw_quote(symbol, values.get(fyers_symbol, {}), session)
                if quote_valid(value, session):
                    quotes[symbol] = value
        except Exception:
            pass
        async def fallback(symbol):
            try:
                meta = (await yahoo_chart(INDICES[symbol][2]))["meta"]
                value = quote_payload(symbol, meta.get("regularMarketPrice"),
                    meta.get("chartPreviousClose", meta.get("previousClose")), meta.get("regularMarketTime"), "yahoo")
                if session:
                    value["market_session"] = session
                quotes[symbol] = value
            except Exception:
                pass
        await asyncio.gather(*(fallback(s) for s in INDICES if s not in quotes))
        instruments = []
        for i, (symbol, (name, _, _)) in enumerate(INDICES.items()):
            q = quotes.get(symbol, {})
            instruments.append({"symbol": symbol, "name": name, "kind": "index", "currency": "INR",
                "value": q.get("price"), "change_abs": q.get("change"), "change_pct": q.get("change_pct"),
                "source": q.get("source"), "delayed": q.get("delayed"), "stale": q.get("stale", True),
                "market_session": q.get("market_session", session), "as_of": q.get("as_of"),
                "updated_at": q.get("as_of"), "sort_order": i})
        return {"instruments": instruments, "market_session": session, "updated_at": utcnow().isoformat(),
                "data_quality": "GOOD" if len(quotes) == 4 and all(q.get("source") == "fyers" for q in quotes.values())
                else "PARTIAL" if quotes else "DEGRADED"}
    return await cache.get_or_load("terminal:overview", 15, load)


async def index_history(symbol, range_name):
    async def load():
        from app.data.fyers_provider import fyers
        resolution, interval, days, period = RANGES[range_name]
        now = utcnow()
        candles, source = [], "fyers"
        try:
            raw = await fyers.get("history", {"symbol": INDICES[symbol][1], "resolution": resolution,
                "date_format": "0", "range_from": str(int((now-timedelta(days=days)).timestamp())),
                "range_to": str(int(now.timestamp())), "cont_flag": "1"})
            candles = candles_from(raw.get("candles", []))
        except Exception:
            pass
        if not candles:
            source = "yahoo"
            raw = await yahoo_chart(INDICES[symbol][2], period, interval)
            values = raw.get("indicators", {}).get("quote", [{}])[0]
            candles = candles_from([[ts] + [values.get(k, [])[i] if i < len(values.get(k, [])) else 0
                for k in ("open", "high", "low", "close", "volume")]
                for i, ts in enumerate(raw.get("timestamp", []))])
        if not candles:
            raise ValueError("No provider candles")
        if range_name == "1D":
            day = datetime.fromtimestamp(candles[-1]["time"], IST).date()
            candles = [c for c in candles if datetime.fromtimestamp(c["time"], IST).date() == day]
        return {"symbol": symbol, "source": source, "interval": interval, "candles": candles,
            "as_of": datetime.fromtimestamp(candles[-1]["time"], timezone.utc).isoformat(), "delayed": source == "yahoo"}
    return await cache.get_or_load(f"terminal:index:{symbol}:{range_name}", 60, load)


async def quotes(symbols):
    async def load():
        from app.data.live_market import market
        session = await market_data.session()
        values = await market_data.equities(symbols, session)
        async def fallback(s):
            try:
                q = await market.yahoo_quote(s)
                if session:
                    q["market_session"] = session
                values[s] = q
            except Exception:
                pass
        await asyncio.gather(*(fallback(s) for s in symbols if s not in values))
        return {"quotes": values, "updated_at": utcnow().isoformat(),
                "data_quality": "PARTIAL" if values else "DEGRADED"}
    return await cache.get_or_load("terminal:quotes:" + ",".join(sorted(symbols)), 15, load)


def technical(candles):
    """Observable factors only; RSI uses Wilder smoothing and RVOL completed days."""
    closes = [c["close"] for c in candles]
    result = {key: None for key in ("rsi", "momentum", "return_20d", "volatility", "sma20", "ema50", "relative_volume", "week_low", "week_high")}
    if not closes:
        return result
    if len(closes) >= 15:
        changes = [b-a for a, b in zip(closes, closes[1:])]
        gain = sum(max(0, c) for c in changes[:14])/14
        loss = sum(max(0, -c) for c in changes[:14])/14
        for c in changes[14:]:
            gain, loss = (gain*13+max(c, 0))/14, (loss*13+max(-c, 0))/14
        result["rsi"] = round(100-100/(1+gain/loss) if loss else 100 if gain else 50, 2)
    if len(closes) >= 21:
        returns = [math.log(b/a) for a, b in zip(closes[-21:], closes[-20:])]
        result.update(sma20=sum(closes[-20:])/20, return_20d=(closes[-1]/closes[-21]-1)*100,
                      volatility=statistics.stdev(returns)*math.sqrt(252)*100)
        result["momentum"] = round(max(0, min(100, 50+result["return_20d"]*2)), 2)
        volumes = [c["volume"] for c in candles[-21:-1]]
        baseline = sum(volumes)/20
        result["relative_volume"] = candles[-1]["volume"]/baseline if baseline > 0 else None
    if len(closes) >= 50:
        ema = sum(closes[:50])/50
        for value in closes[50:]:
            ema = value*2/51+ema*49/51
        result["ema50"] = ema
    if len(closes) >= 240:
        result.update(week_low=min(c["low"] for c in candles[-252:]), week_high=max(c["high"] for c in candles[-252:]))
    return result


async def stock_metrics(symbol):
    async def load():
        from app.data.live_market import market
        async with history_slots:
            try:
                history = await market.history(symbol, "1Y")
                bars = candles_from([[c[k] for k in ("time", "open", "high", "low", "close", "volume")] for c in history["candles"]])
                # Daily factors exclude today's incomplete session (also before normal close).
                local = utcnow().astimezone(IST)
                if (local.hour, local.minute) < (15, 30):
                    bars = [c for c in bars if datetime.fromtimestamp(c["time"], IST).date() < local.date()]
                return {"symbol": symbol, **technical(bars), "source": history["source"],
                        "as_of": datetime.fromtimestamp(bars[-1]["time"], timezone.utc).isoformat() if bars else None,
                        "sample_size": len(bars), "basis": "completed daily candles",
                        "data_quality": "GOOD" if len(bars) >= 50 else "PARTIAL"}
            except Exception:
                return {"symbol": symbol, **technical([]), "source": None, "as_of": None,
                        "data_quality": "DEGRADED", "sample_size": 0}
    return await cache.get_or_load("terminal:metrics:" + symbol, 900, load)


def _interval_seconds(history):
    interval = history.get("interval") if isinstance(history, dict) else None
    # These endpoints request intraday bars. Gaps cannot establish their duration.
    values = {"1m": 60, "5m": 300, "15m": 900, "60m": 3600, "1h": 3600}
    return values.get(interval) if isinstance(interval, str) else None


def _structure_timestamp(value):
    try:
        if isinstance(value, str):
            timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return timestamp.astimezone(timezone.utc) if timestamp.tzinfo else None
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0:
            return datetime.fromtimestamp(value, timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        pass
    return None


def _structure_quote(quote, now):
    quote = dict(quote) if isinstance(quote, dict) else None
    timestamp = _structure_timestamp(quote.get("as_of")) if quote else None
    if quote:
        # Keep the display adapter's 60-second stale boundary on cache hits too.
        usable = (timestamp is not None and 0 <= (now - timestamp).total_seconds() <= 60
                  and quote_valid(quote, now=now) and not quote.get("delayed"))
        quote["stale"] = bool(quote.get("stale") or not usable)
    return quote, timestamp, quote if quote and not quote["stale"] else None


def _structure_response(payload):
    """Expire quote context without reusing cached forming OHLC as a final bar."""
    quote, _, live_quote = _structure_quote(payload.get("quote"), utcnow())
    if live_quote or not quote:
        return payload
    components = dict(payload["rank"]["components"])
    components.pop("depth_imbalance", None)
    rank = {**payload["rank"], "components": components}
    if rank["score"] is not None:
        rank["score"] = round(sum(components.values()), 2)
    return {**payload, "quote": quote, "live_price": None, "depth_imbalance": None,
            "as_of": payload["data_cutoff"], "rank": rank}


def _structure_payload(symbol, quote, history, *, evaluated_at, session, error=None):
    history = history if isinstance(history, dict) else {}
    raw_candles = history.get("candles", []) if isinstance(history.get("candles", []), list) else []
    candles = []
    provider_timestamps = set()
    interval_seconds = _interval_seconds(history)
    for candle in raw_candles:
        if not isinstance(candle, dict):
            candles.append(candle)  # Let the detector report invalid rows.
            continue
        # ExistingMarketData supplies bar START in `time`, never bar-end aliases.
        row = {key: candle[key] for key in ("time", "open", "high", "low", "close", "volume",
               "completed", "is_completed", "is_complete", "forming") if key in candle}
        start = _structure_timestamp(row.get("time"))
        row["time"] = start
        # FYERS can replay one timestamp with either the same row or a
        # corrected OHLC value. Keep the first provider observation so replay
        # rows do not turn an otherwise usable series into all duplicate
        # evidence. The pure detector still rejects duplicates from callers
        # that bypass this provider normalization.
        if start is not None and start in provider_timestamps:
            continue
        if start is not None:
            provider_timestamps.add(start)
        if start is not None and start <= evaluated_at:
            end = start.timestamp() + interval_seconds if interval_seconds else None
            if end is not None and session == "closed":
                local = start.astimezone(IST)
                close = local.replace(hour=15, minute=30, second=0, microsecond=0)
                # The final NSE cash hourly bar is shorter, but only a verified
                # closed session after normal close permits this truncation.
                if (9, 15) <= (local.hour, local.minute) < (15, 30) and close <= evaluated_at:
                    end = min(end, close.timestamp())
            if end is None or end > evaluated_at.timestamp():
                row["completed"] = False  # Even an explicit True cannot confirm a forming bar.
        candles.append(row)
    history_source = history.get("source") if isinstance(history.get("source"), str) else None
    history_time = _structure_timestamp(history.get("as_of"))
    history_as_of = history_time.isoformat() if history_time else None
    quote, quote_time, live_quote = _structure_quote(quote, evaluated_at)
    result = analyze_market_structure(
        candles,
        live_quote=live_quote,
        source=history_source,
        as_of=evaluated_at,
        interval_seconds=interval_seconds,
    )
    payload = result.to_dict()
    rank = result.rank()
    payload.update(
        {
            "symbol": symbol,
            "source": history_source,
            # Evaluation time bounds evidence; it is not an observation timestamp.
            "evaluated_at": evaluated_at.isoformat(),
            "as_of": max(filter(None, (result.data_cutoff, quote_time.isoformat() if live_quote else None)), default=None),
            "quote": quote,
            "market_session": session,
            "history": {
                "source": history_source,
                "as_of": history_as_of,
                "interval": history.get("interval") if isinstance(history.get("interval"), str) else None,
                "delayed": history.get("delayed") if isinstance(history.get("delayed"), bool) else None,
            },
            "rank": {
                "score": rank.score,
                "label": rank.label,
                "components": dict(rank.components),
            },
        }
    )
    if error or result.quality == "UNAVAILABLE":
        payload["error"] = error or "No valid completed provider candles"
    return payload


async def structure(symbol, range_name="1D"):
    if range_name not in structure_ranges:
        raise ValueError("Unsupported structure range")

    async def load():
        evaluated_at = utcnow()
        quotes = await market_data.equities([symbol], session)
        quote = quotes.get(symbol)
        context = {"evaluated_at": evaluated_at, "session": session}
        try:
            async with history_slots:
                history = await market_data.stock_history(symbol, range_name, session=session)
            if not history:
                return _structure_payload(symbol, quote, {}, **context, error="No provider history")
            return _structure_payload(symbol, quote, history, **context)
        except Exception:
            return _structure_payload(symbol, quote, {}, **context, error="Provider history unavailable")

    session = await market_data.session()
    ttl = config.market_ttl_seconds if session == "open" else config.closed_market_ttl_seconds
    payload = await cache.get_or_load(f"terminal:structure:{symbol}:{range_name}:{session}", ttl, load)
    return _structure_response(payload)


async def structure_board(symbols=None, range_name="1D"):
    if range_name not in structure_ranges:
        raise ValueError("Unsupported structure range")

    membership = await market_data.universe()
    official = membership.get("symbols", []) if isinstance(membership, dict) else []
    requested = list(dict.fromkeys(symbols or official))[:50]
    session = await market_data.session()
    ttl = config.market_ttl_seconds if session == "open" else config.closed_market_ttl_seconds
    cache_key = f"terminal:structure-board:{range_name}:{session}:" + ",".join(requested)

    async def load():
        context = {"evaluated_at": utcnow(), "session": session}
        quotes = await market_data.equities(requested, session) if requested else {}

        async def load_one(symbol):
            try:
                async with history_slots:
                    history = await market_data.stock_history(symbol, range_name, session=session)
                return _structure_payload(symbol, quotes.get(symbol), history or {}, **context,
                                          error=None if history else "No provider history")
            except Exception:
                return _structure_payload(symbol, quotes.get(symbol), {}, **context, error="Provider history unavailable")

        rows = await asyncio.gather(*(load_one(symbol) for symbol in requested))
        # One line per board load: the FYERS/Yahoo split is the fastest signal
        # for request-budget starvation or a degraded provider.
        source_counts = {}
        for row in rows:
            source = (row.get("history") or {}).get("source") or row.get("source")
            source_counts[source or "none"] = source_counts.get(source or "none", 0) + 1
        log("structure_board_load", range=range_name, rows=len(rows), sources=source_counts)
        try:
            from app.data.fyers_provider import fyers as fyers_data
            log("fyers_budget_snapshot", **fyers_data.budget.health())
        except Exception:
            pass
        industries = membership.get("industries", {}) if isinstance(membership, dict) else {}
        for row in rows:
            row["industry"] = industries.get(row["symbol"])
            row["market_session"] = session
        return {
            "rows": rows,
            "universe": "NIFTY_50" if requested == official[: len(requested)] else "REQUESTED",
            "requested": len(requested),
            "observed": sum(row.get("quality") != "UNAVAILABLE" for row in rows),
            "source": membership.get("source") if isinstance(membership, dict) else None,
            "market_session": session,
            "updated_at": utcnow().isoformat(),
        }

    payload = await cache.get_or_load(cache_key, ttl, load)
    rows = [_structure_response(row) for row in payload["rows"]]
    rows.sort(key=lambda row: (row["rank"]["score"] is None,
                              -(row["rank"]["score"] or 0), row["symbol"]))
    return {**payload, "rows": rows}


async def fundamentals(symbol):
    async def load():
        import yfinance as yf
        async with fundamental_slots:
            try:
                info = await asyncio.to_thread(lambda: yf.Ticker(symbol + ".NS").get_info())
            except Exception:
                info = {}
        mapping = {"market_cap": "marketCap", "pe_ratio": "trailingPE", "beta": "beta",
                   "dividend_yield": "dividendYield", "week_low": "fiftyTwoWeekLow", "week_high": "fiftyTwoWeekHigh"}
        result = {key: number(info.get(field)) for key, field in mapping.items()}
        return {"symbol": symbol, **result, "source": "yahoo", "basis": "Latest reported fundamentals; not tick data",
                "updated_at": utcnow().isoformat(), "data_quality": "PARTIAL" if any(v is not None for v in result.values()) else "DEGRADED"}
    return await cache.get_or_load("terminal:fundamentals:" + symbol, 21600, load)


async def calendar():
    async def load():
        events, statuses = [], []
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"}) as client:
            for path, kind in (("corporate-board-meetings?index=equities", "Board meeting"),
                               ("corporates-corporateActions?index=equities", "Corporate action")):
                url = "https://www.nseindia.com/api/" + path
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    rows = response.json()
                    for row in rows if isinstance(rows, list) else []:
                        raw_date = row.get("bm_date") or row.get("exDate")
                        try:
                            date = datetime.strptime(raw_date, "%d-%b-%Y").replace(tzinfo=IST)
                        except (ValueError, TypeError):
                            continue
                        if date.date() < utcnow().astimezone(IST).date():
                            continue
                        symbol = row.get("symbol", "")
                        events.append({"id": f"{kind}:{symbol}:{raw_date}", "symbol": symbol,
                            "event": f"{symbol}: {row.get('bm_purpose') or row.get('subject') or kind}",
                            "event_time": date.isoformat(), "time_known": False, "region": "INDIA",
                            "importance": "EVENT", "source": "NSE", "url": url})
                    statuses.append({"source": kind, "status": "available"})
                except Exception:
                    statuses.append({"source": kind, "status": "unavailable"})
        return {"events": sorted(events, key=lambda e: e["event_time"])[:100], "providers": statuses,
                "data_quality": "PARTIAL" if events else "DEGRADED", "updated_at": utcnow().isoformat()}
    return await cache.get_or_load("terminal:calendar", 3600, load)
