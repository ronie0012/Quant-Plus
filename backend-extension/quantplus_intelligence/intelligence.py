from __future__ import annotations

import asyncio
from .common import utcnow
from .market import market_engine
from .market_data import market_data
from .news.service import news_service
from .news.resolver import resolve
from .explanation import agent_explainer


def sector_name(company):
    # Catalog industry tags are associations, not invented sector observations.
    name = company.sector.lower()
    if "bank" in name or company.symbol in {"HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK"}:
        return "BANK"
    for needles, sector in ((["information technology", "technology", "software"], "IT"),
        (["automobile", "auto"], "AUTO"), (["pharma", "healthcare"], "PHARMA"),
        (["fmcg", "consumer staples"], "FMCG"), (["metal", "mining"], "METAL"),
        (["energy", "oil", "gas"], "ENERGY"), (["realty", "real estate"], "REALTY")):
        if any(n in name for n in needles):
            return sector
    return None


async def technical_context(symbol):
    history = await market_data.stock_history(symbol)
    if not history or not history.get("candles"):
        return {"available": False, "technical_bias": None, "rsi": None, "macd": None}
    from app.agents.features import describe
    import pandas as pd
    frame = pd.DataFrame(history["candles"]).rename(columns={k: k.title() for k in ("open", "high", "low", "close", "volume")})
    frame.index = pd.to_datetime(frame["time"], unit="s", utc=True)
    return {"available": True, "source": history["source"], "as_of": history["as_of"],
            "features": describe(frame), "technical_bias": None, "rsi": None, "macd": None}


async def stock_intelligence(symbol, explain=True):
    company = resolve(symbol)
    snapshot, news, sentiment, market, technical = await asyncio.gather(
        market_data.stock(company.symbol), news_service.stock_news(company.symbol),
        news_service.stock_sentiment(company.symbol), market_engine.sentiment(), technical_context(company.symbol))
    sector = sector_name(company)
    quote = snapshot["quote"]
    sector_data = market["sectors"].get(sector, {})
    context = {"symbol": company.symbol,
        "market": {"sentiment_score": market["score"], "label": market["label"], "regime": market["regime"],
                   "confidence": market["confidence"], "market_session": market["market_session"]},
        "sector": {"name": sector, "sentiment_score": sector_data.get("score"), "label": sector_data.get("label", "UNAVAILABLE")},
        "stock": {"live_price": quote.get("price") if quote else None,
                  "change_percent": quote.get("change_pct") if quote else None,
                  "as_of": quote.get("as_of") if quote else None, **technical},
        "news": {"sentiment_score": sentiment["score"], "label": sentiment["label"],
                 "confidence": sentiment["confidence"], "high_impact_articles": [a for a in sentiment["top_drivers"] if a["impact"] == "high"]},
        "warnings": market["warnings"], "updated_at": utcnow().isoformat()}
    ai = await agent_explainer.explain(context, explain)
    return {"symbol": company.symbol, "live_snapshot": quote, "technical_context": technical,
        "important_news": sentiment["top_drivers"], "news_sentiment": sentiment,
        "price_confirmation": sentiment["price_confirmation"], "news_price_divergence": sentiment["news_price_divergence"],
        "quant_ai_context": context, "ai_explanation": ai["explanation"], "ai_status": ai["status"],
        "provider_status": news["provider_status"], "data_quality": "PARTIAL" if quote and sentiment["score"] is not None else "DEGRADED",
        "confidence": min(sentiment["confidence"], market["confidence"]), "updated_at": context["updated_at"]}


async def market_intelligence(explain=True):
    result = await market_engine.sentiment()
    # AI sees only this copy and can only return a nested narrative schema.
    context = {"score": result["score"], "label": result["label"], "confidence": result["confidence"],
        "data_quality": result.get("data_quality"), "data_quality_score": result.get("data_quality_score"),
        "trend": result.get("trend"), "regime": result["regime"], "market_session": result["market_session"],
        "signal_alignment": result.get("signal_alignment"), "divergences": result.get("divergences", []),
        "drivers": result.get("drivers", []), "risks": result.get("risks", []),
        "components": {k: {field: value for field, value in c.items() if field not in ("membership_updated_at", "as_of")}
                       for k, c in result["components"].items()},
        "sectors": {k: {"score": s["score"], "change_pct": s["change_pct"], "change_1h": s.get("change_1h"),
                         "trend": s.get("trend")} for k, s in result["sectors"].items()},
        "important_news": result["important_news"], "warnings": result["warnings"],
        "updated_at": result["updated_at"]}
    ai = await agent_explainer.explain(context, explain)
    return {**result, "ai_explanation": ai["explanation"], "ai_status": ai["status"],
            "risks": list(result["warnings"])}
