"""Read-only terminal data, reusing the existing FYERS transport and research store."""
from __future__ import annotations

import asyncio
import math
import statistics
from datetime import datetime, timedelta, timezone
from urllib.parse import quote as urlquote

import httpx

from .cache import cache
from .common import number, utcnow
from .market_data import market_data, raw_quote, quote_valid, IST

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
