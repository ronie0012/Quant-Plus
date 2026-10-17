"""Reproducible Indian Market Sentiment Index with explicit missingness."""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone

from .analytics import (
    classify_regime,
    data_quality_score,
    detect_divergences,
    sentiment_trend,
    signal_alignment,
)
from .cache import cache
from .common import clamp, label, log, number, utcnow
from .config import config, RULES
from .history import SentimentSnapshot, downsample, history_repository as default_history_repository, range_start
from .market_data import market_data, MarketSnapshotCollector, IST, market_status
from .news.aggregation import aggregate
from .news.service import news_service
from .volume import analyze_volume


def momentum(quote):
    if not quote or number(quote.get("change_pct")) is None:
        return None
    parts = [clamp(50 + quote["change_pct"] / RULES["momentum_pct_scale"] * 50)]
    if number(quote.get("open")) and quote["open"] > 0:
        parts.append(clamp(50 + (quote["price"] / quote["open"] - 1) * 100 / RULES["open_pct_scale"] * 50))
    return sum(parts) / len(parts)


def last_completed_session_quote(quote, history):
    candles = (history or {}).get("candles", [])
    if not quote or len(candles) < 2:
        return quote
    previous, current = candles[-2], candles[-1]
    close = number(current.get("close"))
    previous_close = number(previous.get("close"))
    if not close or not previous_close:
        return quote
    return {**quote, "price": close, "previous_close": previous_close,
            "change": close - previous_close, "change_pct": (close / previous_close - 1) * 100,
            "open": number(current.get("open")) or quote.get("open"),
            "high": number(current.get("high")) or quote.get("high"),
            "low": number(current.get("low")) or quote.get("low"),
            "volume": number(current.get("volume")) or quote.get("volume"),
            "as_of": datetime.fromtimestamp(current["time"], timezone.utc).isoformat(),
            "score_basis": "LAST_COMPLETED_SESSION"}


def _metric_percentage(quotes, predicate, minimum=0):
    observed = [quote for quote in quotes.values() if predicate(quote) is not None]
    if len(observed) < minimum or not observed:
        return None
    return round(sum(bool(predicate(quote)) for quote in observed) / len(observed) * 100, 2)


def sector_for_industry(industry):
    text = (industry or "").lower()
    for needles, sector in ((("bank", "financial"), "BANK"), (("information technology", "software", "it "), "IT"),
        (("automobile", "auto"), "AUTO"), (("pharma", "healthcare"), "PHARMA"),
        (("fmcg", "consumer"), "FMCG"), (("metal", "mining"), "METAL"),
        (("energy", "oil", "gas"), "ENERGY"), (("realty", "real estate"), "REALTY")):
        if any(needle in text for needle in needles):
            return sector
    return None


def breadth(quotes, universe_count, previous=None):
    usable = [q for q in quotes.values() if number(q.get("change_pct")) is not None]
    advancing = sum(q["change_pct"] > RULES["unchanged_pct"] for q in usable)
    declining = sum(q["change_pct"] < -RULES["unchanged_pct"] for q in usable)
    unchanged = len(usable) - advancing - declining
    coverage = len(usable) / universe_count if universe_count else 0
    score = 100 * (advancing + .5 * unchanged) / len(usable) if usable and coverage >= RULES["min_breadth_coverage"] else None
    technical_minimum = max(1, round(len(usable) * RULES["min_breadth_metric_coverage"]))
    above_vwap = _metric_percentage(
        {str(index): quote for index, quote in enumerate(usable)},
        lambda q: None if q.get("vwap") is None or q.get("price") is None else q["price"] > q["vwap"],
        technical_minimum,
    )
    above_ema = _metric_percentage(
        {str(index): quote for index, quote in enumerate(usable)},
        lambda q: None if q.get("ema20") is None or q.get("price") is None else q["price"] > q["ema20"],
        technical_minimum,
    )
    above_dma = _metric_percentage(
        {str(index): quote for index, quote in enumerate(usable)},
        lambda q: None if q.get("dma50") is None or q.get("price") is None else q["price"] > q["dma50"],
        technical_minimum,
    )
    near_high = _metric_percentage(
        {str(index): quote for index, quote in enumerate(usable)},
        lambda q: ((number(q.get("high")) - number(q.get("price"))) / number(q.get("high"))
                   <= RULES["near_session_level_pct"])
        if number(q.get("high")) and number(q.get("price")) else None,
        technical_minimum,
    )
    near_low = _metric_percentage(
        {str(index): quote for index, quote in enumerate(usable)},
        lambda q: ((number(q.get("price")) - number(q.get("low"))) / number(q.get("low"))
                   <= RULES["near_session_level_pct"])
        if number(q.get("low")) and number(q.get("price")) else None,
        technical_minimum,
    )
    pct_advancing = round(advancing / len(usable) * 100, 2) if usable else None
    breadth_change = pct_advancing - previous.get("pct_advancing") if previous and pct_advancing is not None and previous.get("pct_advancing") is not None else None
    breadth_trend = "IMPROVING" if breadth_change is not None and breadth_change >= RULES["trend_change_threshold"] else \
        "DETERIORATING" if breadth_change is not None and breadth_change <= -RULES["trend_change_threshold"] else "STABLE"
    return {"score": score, "confidence": coverage * .9 if score is not None else 0,
            "advancing": advancing, "declining": declining, "unchanged": unchanged,
            "advance_decline_ratio": advancing / declining if declining else None,
            "coverage": coverage, "observed": len(usable), "universe_size": universe_count,
            "universe": "NIFTY_50", "pct_advancing": pct_advancing,
            "pct_declining": round(declining / len(usable) * 100, 2) if usable else None,
            "pct_above_vwap": above_vwap, "pct_above_20ema": above_ema,
            "pct_above_50dma": above_dma, "pct_near_session_highs": near_high,
            "pct_near_session_lows": near_low, "breadth_momentum": breadth_change,
            "breadth_trend": breadth_trend,
            "method": "(advancing + 0.5 × unchanged) / observed × 100; optional technical coverage is explicit"}


def vix_sentiment(quote, history):
    if not quote or number(quote.get("change_pct")) is None:
        return {"score": None, "confidence": 0}
    daily = clamp(50 - quote["change_pct"] / RULES["vix_pct_scale"] * 50)
    # Compare level with recent *completed* sessions, not an absolute arbitrary threshold.
    day = datetime.fromisoformat(quote["as_of"]).astimezone(IST).date()
    previous = [c["close"] for c in history.get("candles", [])
                if datetime.fromtimestamp(c["time"], IST).date() < day and c["close"] > 0][-20:]
    average = sum(previous) / len(previous) if len(previous) >= 10 else None
    relative = (quote["price"] / average - 1) * 100 if average else None
    candles = history.get("candles", [])
    prior_close = candles[-2]["close"] if len(candles) >= 2 and candles[-2].get("close") else None
    rate = (quote["price"] / prior_close - 1) * 100 if prior_close else None
    score = .7 * daily + .3 * clamp(50 - relative / RULES["vix_average_scale"] * 50) if relative is not None else daily
    flags = []
    if quote["change_pct"] >= RULES["vix_sharp_change_pct"]:
        flags.append("VOLATILITY_SPIKE")
    elif quote["change_pct"] <= -RULES["vix_sharp_change_pct"]:
        flags.append("VOLATILITY_COMPRESSION")
    if quote["change_pct"] < 0:
        flags.append("VOLATILITY_CONFIRMATION")
    return {"score": score, "confidence": .85 if average else .65, "level": quote["price"],
             "change_pct": quote["change_pct"], "recent_average": average, "relative_to_average_pct": relative,
             "rate_of_change_pct": rate, "intraday_trend": "RISING" if rate is not None and rate > 0 else "FALLING" if rate is not None and rate < 0 else "STABLE",
             "flags": flags, "method": "inverse daily change; 30% inverse deviation from prior 20-session mean when available"}


def effective_weights(regime_name=None):
    weights = dict(config.market_weights)
    if not config.dynamic_weights_enabled:
        return weights
    adjustments = {}
    if regime_name == "HIGH_VOLATILITY":
        adjustments.update(RULES["dynamic_adjustments"]["HIGH_VOLATILITY"])
    elif regime_name in ("TRENDING_BULLISH", "TRENDING_BEARISH", "STRONG_RISK_ON", "STRONG_RISK_OFF"):
        adjustments.update(RULES["dynamic_adjustments"]["STRONG_TREND"])
    for key, amount in adjustments.items():
        weights[key] = min(weights[key] + amount, config.market_weights[key] * RULES["dynamic_max_multiplier"])
    total = sum(weights.values())
    return {key: value / total for key, value in weights.items()}


def weighted_calculation(components, weights=None):
    weights = weights or config.market_weights
    base_weights = config.market_weights
    available = {k: v for k, v in components.items() if k in weights and number(v.get("score")) is not None}
    # A news-only output cannot masquerade as a quantitative market index.
    if set(available) == {"news_sentiment"}:
        available = {}
    coverage = sum(weights[k] for k in available)
    for key, component in components.items():
        component["weight"] = base_weights[key]
        component["available"] = key in available
        component["effective_weight"] = weights[key] / coverage if coverage and key in available else 0
        if key not in available:
            component.setdefault("reason", "No valid current input")
    score = round(sum(v["score"] * weights[k] for k, v in available.items()) / coverage) if coverage else None
    confidence = sum(weights[k] * clamp(v.get("confidence", 0), 0, 1) for k, v in available.items())
    return {"score": score, "label": label(score, market=True), "confidence": round(confidence, 3),
            "weight_coverage": round(coverage, 3), "components": components,
            "base_weights": dict(base_weights), "effective_weights": dict(weights),
            "data_quality": "GOOD" if coverage >= .99 and confidence >= .8 else "PARTIAL" if coverage >= .5 else "DEGRADED"}


def regime(result):
    """Compatibility wrapper for callers of the original regime function."""
    return classify_regime(result)[0] if result.get("score") is not None else "UNAVAILABLE"


def volume_analysis(rows, quotes, session):
    """Calculate directional volume from already collected quote/history rows.

    A FYERS equivalent-time-of-day baseline is used when intraday candles are
    available.  Otherwise the fallback is explicitly daily-average volume; it
    lowers confidence rather than manufacturing a baseline.
    """
    signed_volume = {"up": 0.0, "down": 0.0}
    relative_values = []
    above_average_up = above_average_down = 0
    sample_symbols = []
    fallback_count = 0
    for symbol, quote, history in rows:
        if not quote or number(quote.get("volume")) is None or quote.get("volume", 0) <= 0:
            continue
        if not history or history.get("source") != "fyers":
            continue
        candles = (history or {}).get("candles", [])
        day = datetime.fromisoformat(quote["as_of"]).astimezone(IST).date()
        previous = [c["volume"] for c in candles
                    if datetime.fromtimestamp(c["time"], IST).date() < day and number(c.get("volume")) and c["volume"] > 0][-20:]
        if len(previous) < 5 or number(quote.get("change_pct")) is None:
            continue
        elapsed = 1.0
        equivalent = False
        if session == "open":
            minute = utcnow().astimezone(IST).hour * 60 + utcnow().astimezone(IST).minute
            elapsed = clamp((minute - 555) / 375, .1, 1)
            # The existing adapter currently supplies daily history for most
            # symbols; don't call that a time-of-day baseline.
            equivalent = any(c.get("interval") in ("1m", "5m", "15m") for c in candles)
        if not equivalent:
            fallback_count += 1
        expected = sum(previous) / len(previous)
        relative = quote["volume"] / expected / elapsed
        relative_values.append(min(relative, 5))
        direction = "up" if quote["change_pct"] > RULES["unchanged_pct"] else "down" if quote["change_pct"] < -RULES["unchanged_pct"] else None
        if direction:
            signed_volume[direction] += quote["volume"]
            if relative >= 1:
                if direction == "up":
                    above_average_up += 1
                else:
                    above_average_down += 1
        sample_symbols.append(symbol)
    count = len(relative_values)
    if not count:
        return {"score": None, "confidence": 0, "sample_size": 0, "required_samples": RULES["min_volume_samples"],
                "sample_symbols": sample_symbols, "data_quality": "DEGRADED",
                "confirmation": "UNAVAILABLE", "reason": "No adequate FYERS volume history",
                "method": "FYERS historical volume required; no neutral value inserted", "as_of": utcnow().isoformat()}
    total_directional = signed_volume["up"] + signed_volume["down"]
    up_ratio = signed_volume["up"] / total_directional if total_directional else None
    down_ratio = signed_volume["down"] / total_directional if total_directional else None
    signed_score = 50 + 50 * ((up_ratio or 0.5) - (down_ratio or 0.5))
    avg_relative = sum(relative_values) / count
    positive_price = sum(q["change_pct"] > RULES["unchanged_pct"] for _, q, _ in rows if q and number(q.get("change_pct")) is not None)
    negative_price = sum(q["change_pct"] < -RULES["unchanged_pct"] for _, q, _ in rows if q and number(q.get("change_pct")) is not None)
    confirmation = "NEUTRAL"
    price_volume_divergence = False
    if up_ratio is not None and positive_price > negative_price:
        confirmation = "BULLISH_CONFIRMATION" if avg_relative >= 1 else "WEAK_BULLISH_MOVE"
        price_volume_divergence = avg_relative < 1
    elif down_ratio is not None and negative_price > positive_price:
        confirmation = "BEARISH_CONFIRMATION" if avg_relative >= 1 else "WEAK_BEARISH_MOVE"
        price_volume_divergence = avg_relative < 1
    enough = count >= RULES["min_volume_samples"]
    confidence = min(.9, .45 + .04 * min(count, 10)) * (0.85 if fallback_count else 1)
    return {"score": round(clamp(signed_score)) if enough else None, "confidence": round(confidence, 3) if enough else 0, "sample_size": count,
            "required_samples": RULES["min_volume_samples"], "sample_symbols": sample_symbols,
            "relative_volume": round(avg_relative, 3), "up_volume_ratio": round(up_ratio, 3) if up_ratio is not None else None,
            "down_volume_ratio": round(down_ratio, 3) if down_ratio is not None else None,
            "advancing_above_average": above_average_up, "declining_above_average": above_average_down,
            "volume_breadth": round((above_average_up / (above_average_up + above_average_down)) * 100, 2)
            if above_average_up + above_average_down else None,
            "confirmation": confirmation, "price_volume_divergence": price_volume_divergence,
            "method": "relative-volume-weighted directional volume; daily-average fallback when equivalent time-of-day baseline is unavailable",
            "reason": "Daily-average fallback used" if fallback_count else None,
            "data_quality": "GOOD" if enough and not fallback_count else "PARTIAL" if enough else "DEGRADED", "as_of": utcnow().isoformat()}


class MarketEngine:
    def __init__(self, data=None, news=None, cache_layer=None, history_repository=None, collector=None):
        self.data = data or market_data
        self.news = news or news_service
        self.cache = cache_layer or cache
        self.collector = collector or MarketSnapshotCollector(self.data, self.cache)
        self.history_repository = history_repository or default_history_repository()
        self._last_snapshot_timestamp = None

    async def sentiment(self):
        async def load():
            start = time.monotonic()
            snapshot, news = await asyncio.gather(self.collector.snapshot(), self.news.market_news())
            session = snapshot.get("session")
            membership = snapshot.get("membership") or {"symbols": []}
            quotes = snapshot.get("quotes", {})
            indices = snapshot.get("indices", {})
            vix_history = snapshot.get("vix_history", {}) or {"candles": []}
            nifty_history = snapshot.get("nifty_history", {}) or {"candles": []}
            index_histories = snapshot.get("index_histories", {})
            if session == "closed":
                for symbol, history in snapshot.get("history_by_symbol", {}).items():
                    if symbol in quotes:
                        quotes[symbol] = last_completed_session_quote(quotes[symbol], history)
            if session == "closed":
                for name in ("NIFTY", "VIX", "BANK", "IT", "AUTO", "PHARMA", "FMCG", "METAL", "ENERGY", "REALTY"):
                    history = index_histories.get(name, {})
                    if indices.get(name) and history.get("candles"):
                        indices[name] = last_completed_session_quote(indices[name], history)
                    elif indices.get(name):
                        indices[name] = {**indices[name], "change_pct": None}
                quotes = {
                    symbol: quote if snapshot.get("history_by_symbol", {}).get(symbol, {}).get("candles")
                    else {**quote, "change_pct": None}
                    for symbol, quote in quotes.items()
                }
            components = {}
            nifty = indices.get("NIFTY")
            components["nifty_momentum"] = {"score": momentum(nifty), "confidence": .75 if nifty else 0,
                "change_pct": nifty.get("change_pct") if nifty else None, "as_of": nifty.get("as_of") if nifty else None,
                "method": "daily change and price versus open, linearly scaled and clipped"}
            if nifty_history.get("candles"):
                try:
                    from app.agents.features import describe
                    import pandas as pd
                    candles = nifty_history["candles"]
                    frame = pd.DataFrame(candles).rename(columns={k: k.title() for k in ("open", "high", "low", "close", "volume")})
                    frame.index = pd.to_datetime(frame["time"], unit="s", utc=True)
                    components["nifty_momentum"]["technical_context"] = describe(frame)
                except Exception:
                    components["nifty_momentum"]["technical_context"] = None
            components["market_breadth"] = breadth(quotes, len(membership.get("symbols", [])))
            components["market_breadth"]["membership_source"] = membership.get("source")
            components["market_breadth"]["membership_updated_at"] = membership.get("updated_at")

            sectors = {}
            for name in ("BANK", "IT", "AUTO", "PHARMA", "FMCG", "METAL", "ENERGY", "REALTY"):
                q = indices.get(name)
                momentum_score = momentum(q)
                score = momentum_score
                sector_symbols = [symbol for symbol, industry in (membership.get("industries") or {}).items()
                                  if sector_for_industry(industry) == name and symbol in quotes]
                sector_quotes = {symbol: quotes[symbol] for symbol in sector_symbols}
                sector_breadth = breadth(sector_quotes, len(sector_symbols))["score"] if len(sector_symbols) >= 3 else None
                sector_articles = [article for article in news.get("articles", []) if name in article.get("affected_sectors", [])]
                sector_news_result = aggregate(sector_articles, name, market=True) if sector_articles else {"score": None, "confidence": 0}
                sector_news = sector_news_result.get("score")
                if score is not None and sector_news is not None:
                    score = .75 * score + .25 * sector_news
                sectors[name] = {"score": round(score) if score is not None else None, "label": label(score),
                    "confidence": round(.75 * (q is not None) + .25 * sector_news_result.get("confidence", 0), 3) if score is not None else 0,
                    "available": score is not None,
                    "change_pct": q.get("change_pct") if q else None, "as_of": q.get("as_of") if q else None,
                    "data_quality": "GOOD" if q and session else "DEGRADED", "breadth": sector_breadth,
                    "momentum": round(momentum_score) if momentum_score is not None else None, "news": None,
                    "volume_confirmation": None, "change_1h": None, "trend": "STABLE",
                    "updated_at": utcnow().isoformat()}
                sectors[name]["news"] = sector_news
            await self._sector_trends(sectors)
            available_sectors = [s for s in sectors.values() if s["score"] is not None]
            sector_score = None
            if len(available_sectors) >= RULES["min_sector_count"]:
                positive_share = sum(s["change_pct"] > RULES["unchanged_pct"] for s in available_sectors) / len(available_sectors)
                unchanged_share = sum(abs(s["change_pct"]) <= RULES["unchanged_pct"] for s in available_sectors) / len(available_sectors)
                sector_score = .5 * 100 * (positive_share + .5 * unchanged_share) + .5 * sum(s["score"] for s in available_sectors) / len(available_sectors)
            components["sector_breadth"] = {"score": sector_score, "confidence": .8 * len(available_sectors) / 8 if sector_score is not None else 0,
                "observed": len(available_sectors), "total": 8, "bullish": sum(s["score"] >= 60 for s in available_sectors),
                "neutral": sum(41 <= s["score"] <= 59 for s in available_sectors), "bearish": sum(s["score"] <= 40 for s in available_sectors),
                "method": "50% sector participation; 50% mean sector momentum"}
            components["india_vix"] = vix_sentiment(indices.get("VIX"), vix_history)
            news_result = aggregate(news.get("articles", []), "MARKET", market=True)
            count = news.get("counts", {}).get("relevant", 0)
            components["news_sentiment"] = {"score": news_result["score"] if count >= RULES["min_market_news_articles"] else None,
                "confidence": news_result["confidence"], "articles": count, "provider_status": news.get("provider_status"),
                "as_of": news.get("updated_at"), "method": news_result["methodology"],
                **({"reason": "Fewer than three independent relevant headlines"} if count < RULES["min_market_news_articles"] else {})}
            components["volume_momentum"] = await self.volume(quotes, session, snapshot.get("history_by_symbol", {}), snapshot.get("intraday_by_symbol", {}))
            bank = indices.get("BANK")
            components["bank_nifty"] = {"score": momentum(bank), "confidence": .75 if bank else 0,
                                       "change_pct": bank.get("change_pct") if bank else None,
                                       "as_of": bank.get("as_of") if bank else None, "method": "Bank Nifty daily change and price versus open"}

            result = weighted_calculation(components)
            result["signal_alignment"] = signal_alignment(components)
            result["divergences"] = detect_divergences(components, sectors)
            result["regime"], regime_drivers = classify_regime(result)
            weights = effective_weights(result["regime"])
            if weights != config.market_weights:
                result = weighted_calculation(components, weights)
                result["signal_alignment"] = signal_alignment(components)
                result["divergences"] = detect_divergences(components, sectors)
                result["regime"], regime_drivers = classify_regime(result)
            quality_score, coverage = data_quality_score(components, session, news)
            result["data_quality_score"] = quality_score
            result["coverage"] = coverage
            result["data_quality"] = "GOOD" if quality_score >= 85 else "PARTIAL" if quality_score >= 60 else "DEGRADED"
            result["confidence"] = self._confidence(result, quality_score, session)
            warnings = [f"{k} unavailable: {v['reason']}" for k, v in components.items() if not v.get("available")]
            warnings.extend(item["description"] for item in result["divergences"] if item["severity"] in ("MEDIUM", "HIGH"))
            if session is None:
                warnings.append("FYERS market session unavailable; quote freshness cannot be fully verified")
            if session == "closed":
                warnings.append("Market closed: market signals refer to the last trading session; news may be newer")
            if news.get("provider_status", {}).get("status") != "available":
                warnings.append("Market news unavailable; score uses market data only")
            updated_at = utcnow().isoformat()
            result.update(regime_confidence=result["confidence"], warnings=warnings, sectors=sectors,
                          important_news=news_result["top_drivers"], market_session=session,
                          market_status=market_status(session),
                          score_basis="LAST_AVAILABLE_SESSION" if session == "closed" else "CURRENT_MARKET_DATA",
                          score_as_of=(nifty.get("as_of") if nifty else None),
                          drivers=regime_drivers + self._drivers(components),
                          risks=warnings, updated_at=updated_at, news_updated_at=news.get("updated_at"),
                          methodology_version="quantplus_market_v2", collector=snapshot.get("collector", {}),
                          score_kind="descriptive_market_condition_index",
                          score_is_probability=False,
                          confidence_kind="input_coverage_heuristic_not_calibrated")
            result["history"] = await self._record_and_trend(result, session)
            log("market_sentiment", duration_ms=round((time.monotonic()-start)*1000),
                missing_components=[k for k, v in components.items() if not v.get("available")],
                weight_coverage=result["weight_coverage"], data_quality_score=quality_score,
                breadth_coverage=coverage["breadth"], sector_coverage=coverage["sectors"],
                volume_coverage=coverage["volume"], cache_hits=snapshot.get("collector", {}).get("cache_hits", 0),
                detected_divergences=[item["type"] for item in result["divergences"]], confidence=result["confidence"])
            return result
        session = await self.data.session()
        ttl = config.closed_market_ttl_seconds if session == "closed" else config.market_ttl_seconds
        return await self.cache.get_or_load("market-sentiment", ttl, load)

    @staticmethod
    def _drivers(components):
        positive = []
        for key, component in components.items():
            if component.get("score") is not None and component.get("score") >= 60:
                positive.append(f"{key.replace('_', ' ').title()} supports the move")
        return positive[:5]

    @staticmethod
    def _confidence(result, quality_score, session):
        base = result.get("confidence", 0)
        alignment = (result.get("signal_alignment") or {}).get("score")
        alignment_factor = .55 + .45 * ((alignment or 50) / 100)
        quality_factor = .5 + .5 * quality_score / 100
        divergence_factor = max(.45, 1 - .08 * len(result.get("divergences", [])))
        if session is None:
            divergence_factor *= .5
        return round(clamp(base * alignment_factor * quality_factor * divergence_factor, 0, 1), 3)

    async def _record_and_trend(self, result, session):
        snapshots = []
        if session == "open":
            snapshot = SentimentSnapshot.from_result(result)
            now = datetime.fromisoformat(snapshot.timestamp)
            last = datetime.fromisoformat(self._last_snapshot_timestamp) if self._last_snapshot_timestamp else None
            if not last or (now - last).total_seconds() >= config.sentiment_history_interval_seconds:
                try:
                    await self.history_repository.save(snapshot)
                    self._last_snapshot_timestamp = snapshot.timestamp
                except Exception as error:
                    log("sentiment_snapshot_persistence_error", error_type=type(error).__name__)
        try:
            snapshots = await self.history_repository.list(range_start("5d"))
        except Exception as error:
            log("sentiment_history_read_error", error_type=type(error).__name__)
        result["trend"] = sentiment_trend(snapshots, current=result.get("score"))
        return result["trend"]

    async def _sector_trends(self, sectors):
        try:
            snapshots = await self.history_repository.list(range_start("1d"))
        except Exception:
            return
        if not snapshots:
            return
        now = utcnow()
        target = now.timestamp() - 3600
        prior = [item for item in snapshots if datetime.fromisoformat(item.timestamp.replace("Z", "+00:00")).timestamp() <= target]
        if not prior:
            return
        sector_scores = prior[-1].metadata.get("sector_scores", {})
        for name, sector in sectors.items():
            old = sector_scores.get(name)
            if old is None or sector.get("score") is None:
                continue
            change = round(sector["score"] - old, 2)
            sector["change_1h"] = change
            sector["trend"] = "IMPROVING" if change >= RULES["trend_change_threshold"] else "DETERIORATING" if change <= -RULES["trend_change_threshold"] else "STABLE"

    async def history(self, range_name="1h", interval=None):
        snapshots = await self.history_repository.list(range_start(range_name))
        return [snapshot.to_dict() for snapshot in downsample(snapshots, interval)]

    async def volume(self, quotes, session, collected_histories=None, collected_intraday=None):
        async def load():
            if collected_histories is not None:
                return analyze_volume(quotes, collected_histories, collected_intraday)
            sample = sorted(quotes)[:RULES["min_volume_samples"]]
            async def get_history(symbol):
                try:
                    return await self.data.stock_history(symbol, "6M")
                except TypeError:
                    try:
                        return await self.data.stock_history(symbol)
                    except Exception:
                        return None
                except Exception:
                    return None
            histories = [collected_histories.get(s) for s in sample] if collected_histories is not None else await asyncio.gather(*(get_history(s) for s in sample))
            rows = [(symbol, quotes[symbol], history) for symbol, history in zip(sample, histories)]
            return volume_analysis(rows, quotes, session)
        return await self.cache.get_or_load("volume-momentum", 300, load)


market_engine = MarketEngine()
